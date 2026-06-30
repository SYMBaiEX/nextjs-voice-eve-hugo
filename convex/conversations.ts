import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireUser,
  requireAdmin,
  assertOwnerOrAdmin,
  logAudit,
} from "./model/authz";

/**
 * Conversations (PRD 5.5, 5.7). Strict per-user isolation: list/get/search only
 * ever return the caller's own conversations. Admin access is segregated into
 * the *ForAdmin functions, which require the admin role.
 */

const modeValidator = v.union(
  v.literal("voice"),
  v.literal("text"),
  v.literal("mixed"),
);

/** Create a conversation owned by the current user. */
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    mode: v.optional(modeValidator),
  },
  handler: async (ctx, { title, mode }) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: user._id,
      title: title?.trim() || "New conversation",
      mode: mode ?? "text",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
  },
});

/** List the current user's conversations (most recent first). */
export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("active"), v.literal("archived"), v.literal("deleted")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    const user = await requireUser(ctx);
    const wanted = status ?? "active";
    // Filter by status AT the index (not after take()) so archived/deleted tabs
    // return the right rows regardless of how many active ones precede them.
    return await ctx.db
      .query("conversations")
      .withIndex("by_user_status_lastMessage", (q) =>
        q.eq("userId", user._id).eq("status", wanted),
      )
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
  },
});

/** Get a single conversation (owner or admin). */
export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) return null;
    assertOwnerOrAdmin(user, convo.userId);
    return convo;
  },
});

/** Full-text-ish search across the current user's conversations. */
export const search = query({
  args: { queryText: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { queryText, limit }) => {
    const user = await requireUser(ctx);
    const needle = queryText.toLowerCase().trim();
    if (!needle) return [];
    const rows = await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(300);
    return rows
      .filter(
        (c) =>
          c.status !== "deleted" &&
          (c.title.toLowerCase().includes(needle) ||
            (c.summary ?? "").toLowerCase().includes(needle) ||
            (c.tags ?? []).some((t) => t.toLowerCase().includes(needle))),
      )
      .slice(0, Math.min(limit ?? 20, 50));
  },
});

export const rename = mutation({
  args: { conversationId: v.id("conversations"), title: v.string() },
  handler: async (ctx, { conversationId, title }) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) throw new Error("Not found");
    assertOwnerOrAdmin(user, convo.userId);
    await ctx.db.patch(conversationId, {
      title: title.trim() || convo.title,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const setStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("deleted"),
    ),
  },
  handler: async (ctx, { conversationId, status }) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) throw new Error("Not found");
    assertOwnerOrAdmin(user, convo.userId);
    await ctx.db.patch(conversationId, { status, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Mark a voice conversation as continuing in text (PRD 5.5). */
export const continueAsText = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) throw new Error("Not found");
    assertOwnerOrAdmin(user, convo.userId);
    const mode = convo.mode === "voice" ? "mixed" : convo.mode;
    await ctx.db.patch(conversationId, { mode, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const setSummary = mutation({
  args: { conversationId: v.id("conversations"), summary: v.string() },
  handler: async (ctx, { conversationId, summary }) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) throw new Error("Not found");
    assertOwnerOrAdmin(user, convo.userId);
    await ctx.db.patch(conversationId, { summary, updatedAt: Date.now() });
    return { ok: true };
  },
});

// ---- Admin ----------------------------------------------------------------

/** Admin: list conversations across all users with optional filters. */
export const listForAdmin = query({
  args: {
    mode: v.optional(modeValidator),
    status: v.optional(
      v.union(v.literal("active"), v.literal("archived"), v.literal("deleted")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { mode, status, limit }) => {
    await requireAdmin(ctx);
    const maxRows = Math.min(limit ?? 100, 500);
    const rows =
      status && mode
        ? await ctx.db
            .query("conversations")
            .withIndex("by_status_mode_lastMessage", (q) =>
              q.eq("status", status).eq("mode", mode),
            )
            .order("desc")
            .take(maxRows)
        : status
          ? await ctx.db
              .query("conversations")
              .withIndex("by_status_lastMessage", (q) =>
                q.eq("status", status),
              )
              .order("desc")
              .take(maxRows)
          : mode
            ? await ctx.db
                .query("conversations")
                .withIndex("by_mode_lastMessage", (q) =>
                  q.eq("mode", mode),
                )
                .order("desc")
                .take(maxRows)
            : await ctx.db
                .query("conversations")
                .withIndex("by_lastMessage")
                .order("desc")
                .take(maxRows);
    const ownerIds = [...new Set(rows.map((c) => c.userId))];
    const ownerEmailById = new Map(
      await Promise.all(
        ownerIds.map(async (ownerId) => {
          const owner = await ctx.db.get(ownerId);
          return [ownerId, owner?.email ?? null] as const;
        }),
      ),
    );
    return rows.map((c) => ({
      ...c,
      ownerEmail: ownerEmailById.get(c.userId) ?? null,
    }));
  },
});

/** Admin: flag a conversation for review (audited). */
export const flagForAdmin = mutation({
  args: { conversationId: v.id("conversations"), reason: v.optional(v.string()) },
  handler: async (ctx, { conversationId, reason }) => {
    const admin = await requireAdmin(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) throw new Error("Not found");
    const tags = new Set(convo.tags ?? []);
    tags.add("flagged");
    await ctx.db.patch(conversationId, {
      tags: [...tags],
      updatedAt: Date.now(),
    });
    await logAudit(
      ctx,
      admin._id,
      "conversation.flag",
      "conversation",
      conversationId,
      { reason },
    );
    return { ok: true };
  },
});

/** Admin: archive/delete a conversation (audited). */
export const setStatusForAdmin = mutation({
  args: {
    conversationId: v.id("conversations"),
    status: v.union(v.literal("archived"), v.literal("deleted")),
  },
  handler: async (ctx, { conversationId, status }) => {
    const admin = await requireAdmin(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) throw new Error("Not found");
    await ctx.db.patch(conversationId, { status, updatedAt: Date.now() });
    await logAudit(
      ctx,
      admin._id,
      `conversation.${status}`,
      "conversation",
      conversationId,
    );
    return { ok: true };
  },
});

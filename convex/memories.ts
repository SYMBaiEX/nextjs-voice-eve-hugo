import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireAdmin } from "./model/authz";

/**
 * User memory (PRD 5.16). Scoped strictly per user — memory is only ever read
 * back for the authenticated owner and never leaks across users. Admins may
 * inspect memory for moderation/support via the *ForAdmin query only.
 */

const typeValidator = v.union(
  v.literal("preference"),
  v.literal("profile"),
  v.literal("project"),
  v.literal("instruction"),
);

/** The current user's active (non-archived) memories. */
export const listOwn = query({
  args: { type: v.optional(typeValidator), limit: v.optional(v.number()) },
  handler: async (ctx, { type, limit }) => {
    const user = await requireUser(ctx);
    const maxRows = Math.min(limit ?? 50, 200);
    const rows = type
      ? await ctx.db
          .query("memories")
          .withIndex("by_user_type", (q) =>
            q.eq("userId", user._id).eq("type", type),
          )
          .order("desc")
          .take(maxRows)
      : await ctx.db
          .query("memories")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(maxRows);
    return rows.filter((m) => m.archivedAt === undefined);
  },
});

/** Upsert a memory keyed by (user, key). Used by the saveUserPreference tool. */
export const upsert = mutation({
  args: {
    type: typeValidator,
    key: v.string(),
    value: v.string(),
    sourceConversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("memories")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", user._id).eq("key", args.key),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        type: args.type,
        value: args.value,
        sourceConversationId: args.sourceConversationId,
        updatedAt: now,
        archivedAt: undefined,
      });
      return existing._id;
    }
    return await ctx.db.insert("memories", {
      userId: user._id,
      type: args.type,
      key: args.key,
      value: args.value,
      sourceConversationId: args.sourceConversationId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Archive (soft-delete) one of the current user's memories. */
export const remove = mutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, { memoryId }) => {
    const user = await requireUser(ctx);
    const mem = await ctx.db.get(memoryId);
    if (!mem) throw new Error("Not found");
    if (mem.userId !== user._id) throw new Error("Forbidden");
    await ctx.db.patch(memoryId, { archivedAt: Date.now() });
    return { ok: true };
  },
});

/** Admin: inspect a specific user's memory (moderation/support/debugging). */
export const listForAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("memories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(500);
  },
});

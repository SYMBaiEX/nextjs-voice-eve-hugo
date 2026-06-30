import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireAdmin, logAudit } from "./model/authz";

/**
 * Tool-call ledger + approval queue (PRD 5.10). Read-only and self-scoped
 * mutating tools auto-approve; risky/admin tools require explicit approval.
 */

const approvalValidator = v.union(
  v.literal("not_required"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
);

/** Record a tool invocation (start). Returns the toolCall id. */
export const log = mutation({
  args: {
    toolName: v.string(),
    conversationId: v.optional(v.id("conversations")),
    approvalStatus: v.optional(approvalValidator),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("toolCalls", {
      userId: user._id,
      conversationId: args.conversationId,
      toolName: args.toolName,
      approvalStatus: args.approvalStatus ?? "not_required",
      input: args.input,
      startedAt: Date.now(),
    });
  },
});

/** Mark a tool call complete with its output or error. */
export const complete = mutation({
  args: {
    toolCallId: v.id("toolCalls"),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { toolCallId, output, error }) => {
    const user = await requireUser(ctx);
    const call = await ctx.db.get(toolCallId);
    if (!call) throw new Error("Tool call not found");
    if (user.role !== "admin" && call.userId !== user._id) {
      throw new Error("Forbidden");
    }
    await ctx.db.patch(toolCallId, {
      output,
      error,
      completedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Current user's recent tool calls. */
export const listOwn = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("toolCalls")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
  },
});

// ---- Admin ----------------------------------------------------------------

/** Admin: the pending tool-approval queue. */
export const pendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("toolCalls")
      .withIndex("by_approvalStatus_started", (q) =>
        q.eq("approvalStatus", "pending"),
      )
      .order("desc")
      .take(100);
    const ownerIds = [...new Set(rows.map((row) => row.userId))];
    const ownerEmailById = new Map(
      await Promise.all(
        ownerIds.map(async (ownerId) => {
          const owner = await ctx.db.get(ownerId);
          return [ownerId, owner?.email ?? null] as const;
        }),
      ),
    );
    return rows.map((r) => ({
      ...r,
      ownerEmail: ownerEmailById.get(r.userId) ?? null,
    }));
  },
});

/** Admin: recent tool calls across all users. */
export const listForAdmin = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("toolCalls")
      .withIndex("by_started")
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    const ownerIds = [...new Set(rows.map((row) => row.userId))];
    const ownerEmailById = new Map(
      await Promise.all(
        ownerIds.map(async (ownerId) => {
          const owner = await ctx.db.get(ownerId);
          return [ownerId, owner?.email ?? null] as const;
        }),
      ),
    );
    return rows.map((r) => ({
      ...r,
      ownerEmail: ownerEmailById.get(r.userId) ?? null,
    }));
  },
});

/** Admin: approve or deny a pending tool call (audited). */
export const review = mutation({
  args: {
    toolCallId: v.id("toolCalls"),
    decision: v.union(v.literal("approved"), v.literal("denied")),
  },
  handler: async (ctx, { toolCallId, decision }) => {
    const admin = await requireAdmin(ctx);
    const call = await ctx.db.get(toolCallId);
    if (!call) throw new Error("Tool call not found");
    await ctx.db.patch(toolCallId, { approvalStatus: decision });
    await logAudit(ctx, admin._id, `tool.${decision}`, "toolCall", toolCallId, {
      toolName: call.toolName,
    });
    return { ok: true };
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireAdmin } from "./model/authz";

/**
 * Agent + system events (PRD 5.9 Agent Events). Lifecycle markers for voice
 * sessions, tool runs, durable tasks, and warnings. Used by the admin console.
 */

export const log = mutation({
  args: {
    eventType: v.string(),
    status: v.string(),
    conversationId: v.optional(v.id("conversations")),
    voiceSessionId: v.optional(v.id("voiceSessions")),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("agentEvents", {
      userId: user._id,
      conversationId: args.conversationId,
      voiceSessionId: args.voiceSessionId,
      eventType: args.eventType,
      status: args.status,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

/** Admin: recent agent events, optionally filtered by type. */
export const listForAdmin = query({
  args: { eventType: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { eventType, limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("agentEvents")
      .withIndex("by_created")
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    return eventType ? rows.filter((e) => e.eventType === eventType) : rows;
  },
});

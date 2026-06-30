import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireUser,
  requireAdmin,
  assertOwnerOrAdmin,
} from "./model/authz";

/**
 * Messages (PRD 5.5, 5.7). Both text and voice turns land here. Writes verify
 * the caller owns the parent conversation; reads enforce owner-or-admin.
 */

const roleValidator = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
  v.literal("tool"),
);
const modalityValidator = v.union(
  v.literal("text"),
  v.literal("audio"),
  v.literal("tool"),
);

/** Ordered messages for a conversation (owner or admin). */
export const list = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, limit }) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(conversationId);
    if (!convo) return [];
    assertOwnerOrAdmin(user, convo.userId);
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("asc")
      .take(Math.min(limit ?? 500, 1000));
  },
});

/** Append a message to a conversation the caller owns. */
export const append = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: roleValidator,
    modality: v.optional(modalityValidator),
    content: v.string(),
    transcript: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new Error("Conversation not found");
    assertOwnerOrAdmin(user, convo.userId);

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      userId: convo.userId,
      role: args.role,
      modality: args.modality ?? "text",
      content: args.content,
      transcript: args.transcript,
      sourceId: args.sourceId,
      toolName: args.toolName,
      toolCallId: args.toolCallId,
      metadata: args.metadata,
      createdAt: now,
    });

    // Keep the conversation ordering/preview fresh.
    const patch: Record<string, unknown> = {
      lastMessageAt: now,
      updatedAt: now,
    };
    if (convo.title === "New conversation" && args.role === "user") {
      patch.title = args.content.slice(0, 60) || convo.title;
    }
    await ctx.db.patch(args.conversationId, patch);

    return messageId;
  },
});

/** Append a finalized realtime voice transcript turn once per SDK message id. */
export const appendVoiceTurn = mutation({
  args: {
    voiceSessionId: v.id("voiceSessions"),
    sourceId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const session = await ctx.db.get(args.voiceSessionId);
    if (!session) throw new Error("Session not found");
    assertOwnerOrAdmin(user, session.userId);
    if (session.status === "ended" || session.status === "failed") {
      throw new Error("Session is already closed");
    }

    const content = args.content.trim();
    if (!content) throw new Error("Message content is required");

    const existing = await ctx.db
      .query("messages")
      .withIndex("by_conversation_source", (q) =>
        q.eq("conversationId", session.conversationId).eq("sourceId", args.sourceId),
      )
      .unique();
    if (existing) return existing._id;

    const convo = await ctx.db.get(session.conversationId);
    if (!convo) throw new Error("Conversation not found");
    assertOwnerOrAdmin(user, convo.userId);

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: session.conversationId,
      userId: session.userId,
      role: args.role,
      modality: "audio",
      content,
      transcript: content,
      sourceId: args.sourceId,
      metadata: {
        source: "ai-sdk-realtime",
        voiceSessionId: args.voiceSessionId,
      },
      createdAt: now,
    });

    const patch: Record<string, unknown> = {
      lastMessageAt: now,
      updatedAt: now,
    };
    if (
      args.role === "user" &&
      (convo.title === "Voice session" || convo.title === "New conversation")
    ) {
      patch.title = content.slice(0, 60) || convo.title;
    }
    await ctx.db.patch(session.conversationId, patch);

    if (args.role === "user") {
      await ctx.db.patch(args.voiceSessionId, {
        status: "active",
        turnCount: session.turnCount + 1,
      });
    }

    return messageId;
  },
});

/** Admin: read a conversation's transcript regardless of owner. */
export const listForAdmin = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("asc")
      .take(1000);
  },
});

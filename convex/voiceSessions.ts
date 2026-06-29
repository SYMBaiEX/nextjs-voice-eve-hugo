import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireUser,
  requireAdmin,
  assertOwnerOrAdmin,
} from "./model/authz";
import { estimateCost } from "./model/usage";

/**
 * Realtime voice session lifecycle (PRD 5.4, 5.7). Records are created when a
 * realtime token is minted and updated as the session connects, runs, ends, or
 * fails. Metadata (turns, interruptions, latency) powers the admin console.
 */

const statusValidator = v.union(
  v.literal("created"),
  v.literal("connecting"),
  v.literal("active"),
  v.literal("ended"),
  v.literal("failed"),
);

/** Create a voice session bound to a conversation the caller owns. */
export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    provider: v.string(),
    model: v.string(),
    voice: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new Error("Conversation not found");
    assertOwnerOrAdmin(user, convo.userId);
    const now = Date.now();
    return await ctx.db.insert("voiceSessions", {
      userId: user._id,
      conversationId: args.conversationId,
      provider: args.provider,
      model: args.model,
      voice: args.voice,
      status: "created",
      startedAt: now,
      interruptionCount: 0,
      turnCount: 0,
    });
  },
});

/** Update session status / error (owner). */
export const updateStatus = mutation({
  args: {
    voiceSessionId: v.id("voiceSessions"),
    status: statusValidator,
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { voiceSessionId, status, errorCode, errorMessage }) => {
    const user = await requireUser(ctx);
    const session = await ctx.db.get(voiceSessionId);
    if (!session) throw new Error("Session not found");
    assertOwnerOrAdmin(user, session.userId);
    await ctx.db.patch(voiceSessionId, {
      status,
      ...(errorCode ? { errorCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    });
    return { ok: true };
  },
});

/** End a session and stamp duration (owner). */
export const end = mutation({
  args: {
    voiceSessionId: v.id("voiceSessions"),
    status: v.optional(v.union(v.literal("ended"), v.literal("failed"))),
    interruptionCount: v.optional(v.number()),
    turnCount: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const session = await ctx.db.get(args.voiceSessionId);
    if (!session) throw new Error("Session not found");
    assertOwnerOrAdmin(user, session.userId);
    const endedAt = Date.now();
    const durationMs = endedAt - session.startedAt;
    await ctx.db.patch(args.voiceSessionId, {
      status: args.status ?? "ended",
      endedAt,
      durationMs,
      ...(args.interruptionCount !== undefined
        ? { interruptionCount: args.interruptionCount }
        : {}),
      ...(args.turnCount !== undefined ? { turnCount: args.turnCount } : {}),
      ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      ...(args.errorMessage ? { errorMessage: args.errorMessage } : {}),
    });

    // Meter voice usage from the authoritative server-measured duration, so the
    // daily voice-minute limit (checked at session start) cannot be bypassed by
    // a client that omits audio-second fields (PRD 5.17). Split evenly between
    // input/output for the cost estimate.
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    const audioInputSeconds = Math.round(seconds / 2);
    const audioOutputSeconds = seconds - audioInputSeconds;
    await ctx.db.insert("usageEvents", {
      userId: session.userId,
      conversationId: session.conversationId,
      voiceSessionId: args.voiceSessionId,
      type: "voice_session",
      provider: session.provider,
      model: session.model,
      audioInputSeconds,
      audioOutputSeconds,
      estimatedCost: estimateCost({ audioInputSeconds, audioOutputSeconds }),
      createdAt: endedAt,
    });
    return { ok: true };
  },
});

/** Increment running counters during a live session (owner). */
export const recordTurn = mutation({
  args: {
    voiceSessionId: v.id("voiceSessions"),
    kind: v.union(v.literal("turn"), v.literal("interruption")),
  },
  handler: async (ctx, { voiceSessionId, kind }) => {
    const user = await requireUser(ctx);
    const session = await ctx.db.get(voiceSessionId);
    if (!session) throw new Error("Session not found");
    assertOwnerOrAdmin(user, session.userId);
    await ctx.db.patch(voiceSessionId, {
      turnCount: session.turnCount + (kind === "turn" ? 1 : 0),
      interruptionCount:
        session.interruptionCount + (kind === "interruption" ? 1 : 0),
      status: "active",
    });
    return { ok: true };
  },
});

/** The current user's recent voice sessions. */
export const listOwn = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("voiceSessions")
      .withIndex("by_user_started", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
  },
});

// ---- Admin ----------------------------------------------------------------

export const listForAdmin = query({
  args: { status: v.optional(statusValidator), limit: v.optional(v.number()) },
  handler: async (ctx, { status, limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("voiceSessions")
      .withIndex("by_started")
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    const filtered = status ? rows.filter((s) => s.status === status) : rows;
    return await Promise.all(
      filtered.map(async (s) => {
        const owner = await ctx.db.get(s.userId);
        return { ...s, ownerEmail: owner?.email ?? null };
      }),
    );
  },
});

export const getDiagnostics = query({
  args: { voiceSessionId: v.id("voiceSessions") },
  handler: async (ctx, { voiceSessionId }) => {
    await requireAdmin(ctx);
    const session = await ctx.db.get(voiceSessionId);
    if (!session) return null;
    const events = await ctx.db
      .query("agentEvents")
      .withIndex("by_voiceSession", (q) =>
        q.eq("voiceSessionId", voiceSessionId),
      )
      .order("desc")
      .take(100);
    const usage = await ctx.db
      .query("usageEvents")
      .withIndex("by_voiceSession", (q) =>
        q.eq("voiceSessionId", voiceSessionId),
      )
      .collect();
    return { session, events, usage };
  },
});

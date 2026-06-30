import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
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

/** Voice sessions sitting un-ended this long are treated as orphaned (a crashed
 *  tab or a dropped end-beacon). Generous vs. the realtime token TTL (60s) and
 *  the 30-minute daily voice cap, so a legitimately-live session is never cut. */
const STALE_VOICE_SESSION_MS = 60 * 60 * 1000; // 1 hour
/** Cap per cron run so the sweep stays well within a mutation's read/write
 *  limits; any backlog drains over subsequent runs. */
const STALE_SWEEP_BATCH = 100;

const statusValidator = v.union(
  v.literal("created"),
  v.literal("connecting"),
  v.literal("active"),
  v.literal("ended"),
  v.literal("failed"),
);

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

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

/** Store the short-lived server-minted grant used by realtime tool callbacks. */
export const setRealtimeToolGrant = mutation({
  args: {
    voiceSessionId: v.id("voiceSessions"),
    grantHash: v.string(),
    expiresAtMs: v.number(),
    issuedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const session = await ctx.db.get(args.voiceSessionId);
    if (!session) throw new Error("Session not found");
    assertOwnerOrAdmin(user, session.userId);
    if (session.status === "ended" || session.status === "failed") {
      throw new Error("Session is already closed");
    }
    await ctx.db.patch(args.voiceSessionId, {
      metadata: {
        ...metadataRecord(session.metadata),
        realtimeToolGrant: {
          expiresAtMs: args.expiresAtMs,
          hash: args.grantHash,
          issuedAtMs: args.issuedAtMs,
        },
      },
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
    const endedAt = session.endedAt ?? Date.now();
    const durationMs = session.durationMs ?? endedAt - session.startedAt;
    await ctx.db.patch(args.voiceSessionId, {
      ...(session.endedAt === undefined
        ? {
            status: args.status ?? "ended",
            endedAt,
            durationMs,
          }
        : {}),
      ...(args.interruptionCount !== undefined
        ? { interruptionCount: args.interruptionCount }
        : {}),
      ...(args.turnCount !== undefined ? { turnCount: args.turnCount } : {}),
      ...(args.errorCode ? { errorCode: args.errorCode } : {}),
      ...(args.errorMessage ? { errorMessage: args.errorMessage } : {}),
    });

    const existingUsage = await ctx.db
      .query("usageEvents")
      .withIndex("by_voiceSession", (q) =>
        q.eq("voiceSessionId", args.voiceSessionId),
      )
      .take(10);
    const alreadyMetered = existingUsage.some(
      (event) => event.type === "voice_session",
    );

    if (!alreadyMetered) {
      // Meter voice usage from the authoritative server-measured duration, so
      // the daily voice-minute limit (checked at session start) cannot be
      // bypassed by a client that omits audio-second fields (PRD 5.17). Split
      // evenly between input/output for the cost estimate.
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
    }
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

/**
 * Cron-driven cleanup (PRD 5.7): finalize voice sessions that were never ended.
 * Closes the orphan gap the client teardown can't cover — browser crashes,
 * killed tabs, dropped end-beacons — which otherwise leave sessions stuck
 * "created" / "connecting" / "active" forever. Internal-only: scheduled from
 * `convex/crons.ts`, never callable from a client.
 *
 * Swept sessions are stamped "ended" with `errorCode: "swept_stale"` so they're
 * identifiable in the admin console. They are intentionally NOT metered: their
 * wall-clock duration is untrustworthy (a tab left open idle could be hours),
 * and the normal end path (sendBeacon / keepalive fetch) already meters real
 * exits from the server-measured duration. Idempotent and batched.
 */
export const endStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - STALE_VOICE_SESSION_MS;
    const openStatuses = ["created", "connecting", "active"] as const;
    let ended = 0;
    for (const status of openStatuses) {
      // by_status_started is [status, startedAt], so this scans only un-ended
      // sessions of one status, oldest first — no full-table scan.
      const stale = await ctx.db
        .query("voiceSessions")
        .withIndex("by_status_started", (q) =>
          q.eq("status", status).lt("startedAt", cutoff),
        )
        .take(STALE_SWEEP_BATCH);
      for (const session of stale) {
        await ctx.db.patch(session._id, {
          status: "ended",
          endedAt: now,
          durationMs: session.durationMs ?? now - session.startedAt,
          errorCode: "swept_stale",
          errorMessage: "Auto-closed: no end signal received.",
        });
        ended += 1;
      }
    }
    return { ended };
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

/** Owner-safe lookup used by the realtime token route to validate session
 *  ownership and keep the browser payload aligned with the persisted session. */
export const getOwn = query({
  args: { voiceSessionId: v.id("voiceSessions") },
  handler: async (ctx, { voiceSessionId }) => {
    const user = await requireUser(ctx);
    const session = await ctx.db.get(voiceSessionId);
    if (!session) return null;
    assertOwnerOrAdmin(user, session.userId);
    return session;
  },
});

// ---- Admin ----------------------------------------------------------------

export const listForAdmin = query({
  args: { status: v.optional(statusValidator), limit: v.optional(v.number()) },
  handler: async (ctx, { status, limit }) => {
    await requireAdmin(ctx);
    const maxRows = Math.min(limit ?? 100, 500);
    const rows = status
      ? await ctx.db
          .query("voiceSessions")
          .withIndex("by_status_started", (q) => q.eq("status", status))
          .order("desc")
          .take(maxRows)
      : await ctx.db
          .query("voiceSessions")
          .withIndex("by_started")
          .order("desc")
          .take(maxRows);
    const ownerIds = [...new Set(rows.map((session) => session.userId))];
    const ownerEmailById = new Map(
      await Promise.all(
        ownerIds.map(async (ownerId) => {
          const owner = await ctx.db.get(ownerId);
          return [ownerId, owner?.email ?? null] as const;
        }),
      ),
    );
    return rows.map((s) => ({
      ...s,
      ownerEmail: ownerEmailById.get(s.userId) ?? null,
    }));
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
      .take(10);
    return { session, events, usage };
  },
});

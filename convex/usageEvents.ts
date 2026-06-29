import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireUser, requireAdmin } from "./model/authz";
import { estimateCost, startOfTodayUtc } from "./model/usage";

/** Effective daily limits: admin system settings take precedence, then the
 *  user's own usageLimits, then env defaults. Lets the admin Settings page
 *  actually change enforcement at runtime (PRD 5.8). */
async function effectiveLimits(
  ctx: QueryCtx,
  userLimits?: { dailyVoiceMinutes: number; dailyTextMessages: number },
): Promise<{ dailyVoiceMinutes: number; dailyTextMessages: number }> {
  const read = async (key: string): Promise<number | undefined> => {
    const row = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return typeof row?.value === "number" ? (row.value as number) : undefined;
  };
  const voice =
    (await read("dailyVoiceMinutesLimit")) ??
    userLimits?.dailyVoiceMinutes ??
    Number(process.env.DAILY_VOICE_MINUTES_LIMIT ?? 30);
  const text =
    (await read("dailyTextMessagesLimit")) ??
    userLimits?.dailyTextMessages ??
    Number(process.env.DAILY_TEXT_MESSAGES_LIMIT ?? 200);
  return { dailyVoiceMinutes: voice, dailyTextMessages: text };
}

/**
 * Usage + cost events (PRD 5.9). Every AI interaction logs one row: tokens,
 * audio seconds, latency, and an estimated cost. Users see their own summary;
 * admins see global rollups.
 */

/** Log a usage event for the current user. */
export const log = mutation({
  args: {
    type: v.string(),
    conversationId: v.optional(v.id("conversations")),
    voiceSessionId: v.optional(v.id("voiceSessions")),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    audioInputSeconds: v.optional(v.number()),
    audioOutputSeconds: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    estimatedCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const cost =
      args.estimatedCost ??
      estimateCost({
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        audioInputSeconds: args.audioInputSeconds,
        audioOutputSeconds: args.audioOutputSeconds,
      });
    return await ctx.db.insert("usageEvents", {
      userId: user._id,
      conversationId: args.conversationId,
      voiceSessionId: args.voiceSessionId,
      type: args.type,
      provider: args.provider,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      audioInputSeconds: args.audioInputSeconds,
      audioOutputSeconds: args.audioOutputSeconds,
      estimatedCost: cost,
      latencyMs: args.latencyMs,
      createdAt: Date.now(),
    });
  },
});

/** Current user's usage today (for limit display + enforcement context). */
export const todayForUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const since = startOfTodayUtc();
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", user._id).gte("createdAt", since),
      )
      .collect();
    let textMessages = 0;
    let voiceSeconds = 0;
    let cost = 0;
    for (const r of rows) {
      if (r.type === "text_message") textMessages += 1;
      voiceSeconds += (r.audioInputSeconds ?? 0) + (r.audioOutputSeconds ?? 0);
      cost += r.estimatedCost ?? 0;
    }
    const limits = await effectiveLimits(ctx, user.usageLimits);
    return {
      textMessages,
      voiceMinutes: Number((voiceSeconds / 60).toFixed(1)),
      estimatedCost: Number(cost.toFixed(4)),
      limits,
    };
  },
});

/** Current user's lifetime summary. */
export const summaryForUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(2000);
    let inputTokens = 0;
    let outputTokens = 0;
    let cost = 0;
    let audioSeconds = 0;
    for (const r of rows) {
      inputTokens += r.inputTokens ?? 0;
      outputTokens += r.outputTokens ?? 0;
      cost += r.estimatedCost ?? 0;
      audioSeconds += (r.audioInputSeconds ?? 0) + (r.audioOutputSeconds ?? 0);
    }
    return {
      events: rows.length,
      inputTokens,
      outputTokens,
      audioMinutes: Number((audioSeconds / 60).toFixed(1)),
      estimatedCost: Number(cost.toFixed(4)),
    };
  },
});

// ---- Admin ----------------------------------------------------------------

/** Global usage rollup over the last `days` days, bucketed by day + by model. */
export const globalSummary = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    await requireAdmin(ctx);
    const windowDays = Math.min(days ?? 14, 90);
    const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_created", (q) => q.gte("createdAt", since))
      .take(10000);

    const byDay = new Map<
      string,
      { date: string; cost: number; events: number; tokens: number }
    >();
    const byModel = new Map<
      string,
      { model: string; cost: number; events: number; tokens: number }
    >();
    let totalCost = 0;
    let totalTokens = 0;
    let audioSeconds = 0;

    for (const r of rows) {
      const date = new Date(r.createdAt).toISOString().slice(0, 10);
      const tokens = (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
      const cost = r.estimatedCost ?? 0;
      totalCost += cost;
      totalTokens += tokens;
      audioSeconds += (r.audioInputSeconds ?? 0) + (r.audioOutputSeconds ?? 0);

      const d = byDay.get(date) ?? { date, cost: 0, events: 0, tokens: 0 };
      d.cost += cost;
      d.events += 1;
      d.tokens += tokens;
      byDay.set(date, d);

      const modelKey = r.model ?? "unknown";
      const m = byModel.get(modelKey) ?? {
        model: modelKey,
        cost: 0,
        events: 0,
        tokens: 0,
      };
      m.cost += cost;
      m.events += 1;
      m.tokens += tokens;
      byModel.set(modelKey, m);
    }

    return {
      totalCost: Number(totalCost.toFixed(4)),
      totalTokens,
      totalEvents: rows.length,
      audioMinutes: Number((audioSeconds / 60).toFixed(1)),
      byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost),
    };
  },
});

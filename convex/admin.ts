import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, logAudit } from "./model/authz";
import { startOfTodayUtc } from "./model/usage";

/**
 * Admin console data (PRD 5.8). All functions require the admin role. Every
 * mutation writes an audit log. The default-owner account is protected from
 * demotion/disable.
 */

const DEFAULT_ADMIN_EMAIL = (
  process.env.DEFAULT_ADMIN_EMAIL ?? "solsymbaiex@gmail.com"
).toLowerCase();

/** Overview metrics for the dashboard landing. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const startToday = startOfTodayUtc();

    const users = await ctx.db.query("users").take(5000);
    const activeToday = users.filter((u) => u.lastSeenAt >= startToday).length;

    const recentSessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_started", (q) => q.gte("startedAt", startToday))
      .take(2000);
    const sessionsToday = recentSessions.length;
    const failedSessions = recentSessions.filter(
      (s) => s.status === "failed",
    ).length;

    const recentConvos = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessage", (q) => q.gte("lastMessageAt", startToday))
      .take(2000);
    const textConvosToday = recentConvos.filter(
      (c) => c.mode === "text" || c.mode === "mixed",
    ).length;

    const usage = await ctx.db
      .query("usageEvents")
      .withIndex("by_created", (q) => q.gte("createdAt", startToday))
      .take(5000);
    let spendToday = 0;
    let latencySum = 0;
    let latencyCount = 0;
    const modelCost = new Map<string, number>();
    for (const u of usage) {
      spendToday += u.estimatedCost ?? 0;
      if (u.latencyMs) {
        latencySum += u.latencyMs;
        latencyCount += 1;
      }
      if (u.model) {
        modelCost.set(u.model, (modelCost.get(u.model) ?? 0) + (u.estimatedCost ?? 0));
      }
    }

    const pendingTools = await ctx.db
      .query("toolCalls")
      .withIndex("by_approvalStatus_started", (q) =>
        q.eq("approvalStatus", "pending"),
      )
      .take(200);

    const errorEvents = await ctx.db
      .query("agentEvents")
      .withIndex("by_created", (q) => q.gte("createdAt", startToday))
      .take(2000);
    const errorCount = errorEvents.filter(
      (e) => e.status === "error" || e.status === "failed",
    ).length;

    const topModels = [...modelCost.entries()]
      .map(([model, cost]) => ({ model, cost: Number(cost.toFixed(4)) }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    return {
      totalUsers: users.length,
      activeToday,
      voiceSessionsToday: sessionsToday,
      textConversationsToday: textConvosToday,
      avgLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : 0,
      errorRate: errorEvents.length
        ? Number((errorCount / errorEvents.length).toFixed(3))
        : 0,
      estimatedSpendToday: Number(spendToday.toFixed(4)),
      topModels,
      realtimeFailuresToday: failedSessions,
      toolApprovalQueue: pendingTools.length,
    };
  },
});

/** Admin: list users with search + lightweight decoration. */
export const listUsers = query({
  args: { search: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { search, limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("users").take(Math.min(limit ?? 200, 1000));
    const needle = search?.toLowerCase().trim();
    const filtered = needle
      ? rows.filter(
          (u) =>
            (u.email ?? "").toLowerCase().includes(needle) ||
            (u.name ?? "").toLowerCase().includes(needle),
        )
      : rows;
    return filtered
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((u) => ({
        _id: u._id,
        email: u.email ?? null,
        name: u.name ?? null,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
        isDefaultAdmin: (u.email ?? "").toLowerCase() === DEFAULT_ADMIN_EMAIL,
      }));
  },
});

/** Admin: per-user usage summary (PRD getUserUsageSummary). */
export const userUsageSummary = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const usage = await ctx.db
      .query("usageEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(5000);
    const sessions = await ctx.db
      .query("voiceSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000);
    const convos = await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000);
    let cost = 0;
    let voiceSeconds = 0;
    for (const u of usage) {
      cost += u.estimatedCost ?? 0;
      voiceSeconds += (u.audioInputSeconds ?? 0) + (u.audioOutputSeconds ?? 0);
    }
    return {
      conversations: convos.length,
      voiceSessions: sessions.length,
      voiceMinutes: Number((voiceSeconds / 60).toFixed(1)),
      estimatedCost: Number(cost.toFixed(4)),
      usageEvents: usage.length,
    };
  },
});

/** Admin: promote/demote a user (audited; default owner protected). */
export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, { userId, role }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");
    if ((target.email ?? "").toLowerCase() === DEFAULT_ADMIN_EMAIL && role !== "admin") {
      throw new Error("The default owner account cannot be demoted.");
    }
    await ctx.db.patch(userId, { role, updatedAt: Date.now() });
    await logAudit(ctx, admin._id, "user.setRole", "user", userId, { role });
    return { ok: true };
  },
});

/** Admin: enable/disable an account (audited; default owner protected). */
export const setUserStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("disabled")),
  },
  handler: async (ctx, { userId, status }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");
    if (
      (target.email ?? "").toLowerCase() === DEFAULT_ADMIN_EMAIL &&
      status === "disabled"
    ) {
      throw new Error("The default owner account cannot be disabled.");
    }
    await ctx.db.patch(userId, { status, updatedAt: Date.now() });
    await logAudit(ctx, admin._id, "user.setStatus", "user", userId, { status });
    return { ok: true };
  },
});

/** Admin: audit log (most recent first). */
export const auditLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("adminAuditLogs")
      .withIndex("by_created")
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    return await Promise.all(
      rows.map(async (r) => {
        const admin = await ctx.db.get(r.adminUserId);
        return { ...r, adminEmail: admin?.email ?? null };
      }),
    );
  },
});

/** Health snapshot for /api/admin/health. */
export const health = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { ok: true, time: Date.now() };
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireAdmin, logAudit, getCurrentUser } from "./model/authz";

/**
 * System settings (PRD 5.8 Settings). Admin-only writes, each audited. A small
 * allow-list of keys is publicly readable so the marketing/landing surface can
 * respect runtime config (e.g. guest preview, default voice).
 */

const DEFAULTS: Record<string, unknown> = {
  defaultRealtimeModel:
    process.env.DEFAULT_REALTIME_MODEL ?? "openai/gpt-realtime-2",
  defaultTextModel: process.env.DEFAULT_TEXT_MODEL ?? "openai/gpt-5.5",
  defaultVoice: process.env.DEFAULT_VOICE ?? "alloy",
  guestPreviewEnabled: (process.env.ENABLE_GUEST_PREVIEW ?? "false") === "true",
  dailyVoiceMinutesLimit: Number(process.env.DAILY_VOICE_MINUTES_LIMIT ?? 30),
  dailyTextMessagesLimit: Number(process.env.DAILY_TEXT_MESSAGES_LIMIT ?? 200),
  toolApprovalPolicy: "auto-safe", // auto-safe | manual-all
  maintenanceMode: false,
};

const PUBLIC_KEYS = new Set(["guestPreviewEnabled", "defaultVoice"]);

async function readSetting(ctx: QueryCtx, key: string): Promise<unknown> {
  const row = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row ? row.value : DEFAULTS[key];
}

/** All effective settings (admin only). */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const result: Record<string, unknown> = { ...DEFAULTS };
    const rows = await ctx.db.query("systemSettings").collect();
    for (const row of rows) result[row.key] = row.value;
    return result;
  },
});

/** Publicly-readable subset (safe for guests / landing page). */
export const getPublic = query({
  args: {},
  handler: async (ctx) => {
    const result: Record<string, unknown> = {};
    for (const key of PUBLIC_KEYS) result[key] = await readSetting(ctx, key);
    // Whether "Sign in with Vercel" is configured — lets the sign-in UI show
    // the button only when it will actually work. Derived from the Convex env
    // (AUTH_VERCEL_ID), not a stored setting.
    result.vercelSignInEnabled = !!process.env.AUTH_VERCEL_ID;
    return result;
  },
});

/** Runtime config the AI routes need (any authenticated user). Lets admin
 *  Settings changes (model, voice, maintenance) actually take effect at runtime. */
export const getRuntime = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthorized");
    return {
      defaultRealtimeModel: (await readSetting(
        ctx,
        "defaultRealtimeModel",
      )) as string,
      defaultTextModel: (await readSetting(ctx, "defaultTextModel")) as string,
      defaultVoice: (await readSetting(ctx, "defaultVoice")) as string,
      maintenanceMode: (await readSetting(ctx, "maintenanceMode")) === true,
    };
  },
});

/** Read a single effective value, applying defaults. */
export const getValue = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    // Non-public keys require auth; admins can read anything.
    if (!PUBLIC_KEYS.has(key)) {
      const user = await getCurrentUser(ctx);
      if (!user) throw new Error("Unauthorized");
    }
    return await readSetting(ctx, key);
  },
});

/** Admin: upsert a setting (audited). */
export const update = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, { key, value }) => {
    const admin = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value,
        updatedBy: admin._id,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("systemSettings", {
        key,
        value,
        updatedBy: admin._id,
        updatedAt: Date.now(),
      });
    }
    await logAudit(ctx, admin._id, "settings.update", "systemSetting", key, {
      value,
    });
    return { ok: true };
  },
});

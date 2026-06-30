import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getCurrentUser,
  requireUser,
  requireAdmin,
} from "./model/authz";

/**
 * User profile + preferences (PRD 5.1, 5.16). Users only ever read/write their
 * own record; admin reads go through convex/admin.ts.
 */

/** The signed-in user's profile (client-safe projection), or null for guests. */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      image: user.image ?? null,
      role: user.role,
      status: user.status,
      preferences: user.preferences ?? { theme: "dark" },
      usageLimits: user.usageLimits ?? null,
      // BYOK status only — the encrypted key itself is never returned.
      hasGatewayKey: !!user.gatewayKeyEncrypted,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    };
  },
});

/** Store the current user's encrypted AI Gateway key (ciphertext only — the
 *  Route Handler encrypts before calling this; the plaintext never reaches
 *  Convex). */
export const setGatewayKey = mutation({
  args: { encrypted: v.string() },
  handler: async (ctx, { encrypted }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      gatewayKeyEncrypted: encrypted,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Remove the current user's stored AI Gateway key. */
export const clearGatewayKey = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      gatewayKeyEncrypted: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** The caller's OWN encrypted gateway key (ciphertext), for the AI Route
 *  Handlers to decrypt server-side. Never another user's, never plaintext. */
export const gatewayKeyForSelf = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return user?.gatewayKeyEncrypted ?? null;
  },
});

/** Update the current user's preferences. */
export const updatePreferences = mutation({
  args: {
    preferences: v.object({
      theme: v.optional(
        v.union(v.literal("dark"), v.literal("light"), v.literal("system")),
      ),
      voice: v.optional(v.string()),
      conciseVoice: v.optional(v.boolean()),
      reducedMotion: v.optional(v.boolean()),
      preferredTextModel: v.optional(v.string()),
      preferredRealtimeModel: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { preferences }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      preferences: { ...(user.preferences ?? {}), ...preferences },
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Refresh lastSeenAt (called on app focus / session start). */
export const touch = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { ok: false };
    await ctx.db.patch(user._id, { lastSeenAt: Date.now() });
    return { ok: true };
  },
});

/** Admin: fetch a single user's full record (minus the encrypted secret). */
export const getByIdForAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const safe: Partial<typeof user> = { ...user };
    delete safe.gatewayKeyEncrypted;
    return safe;
  },
});

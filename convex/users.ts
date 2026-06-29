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
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    };
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

/** Admin: fetch a single user's full record. */
export const getByIdForAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    return await ctx.db.get(userId);
  },
});

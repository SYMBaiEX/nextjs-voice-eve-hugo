import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Authorization helpers (PRD 5.1, 5.7, 5.17). Every Convex function that
 * touches user-owned data must resolve identity through these helpers — never
 * trust a userId passed from the client.
 */

export type AnyCtx = QueryCtx | MutationCtx;

/** The signed-in user document, or null when unauthenticated. */
export async function getCurrentUser(
  ctx: AnyCtx,
): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

/** Require an authenticated, active user. Throws otherwise. */
export async function requireUser(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Unauthorized: sign in required.");
  if (user.status === "disabled") {
    throw new Error("Forbidden: this account is disabled.");
  }
  return user;
}

/** Require an authenticated admin. Throws for guests and regular users. */
export async function requireAdmin(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Forbidden: admin access required.");
  }
  return user;
}

/** Assert a resource owned by `ownerId` is readable/writable by `user`. */
export function assertOwnerOrAdmin(
  user: Doc<"users">,
  ownerId: Id<"users">,
): void {
  if (user.role === "admin") return;
  if (user._id !== ownerId) {
    throw new Error("Forbidden: you do not have access to this resource.");
  }
}

/** True when the user may act on the resource (no throw). */
export function canAccess(user: Doc<"users">, ownerId: Id<"users">): boolean {
  return user.role === "admin" || user._id === ownerId;
}

/**
 * Append an immutable admin audit log entry (PRD 5.8 "Every admin mutation
 * writes an audit log"). Call from within admin mutations.
 */
export async function logAudit(
  ctx: MutationCtx,
  adminUserId: Id<"users">,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: unknown,
): Promise<void> {
  await ctx.db.insert("adminAuditLogs", {
    adminUserId,
    action,
    targetType,
    targetId,
    metadata,
    createdAt: Date.now(),
  });
}

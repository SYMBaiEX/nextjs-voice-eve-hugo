import type { Role } from "@/lib/constants";

/**
 * Pure role/permission helpers, safe on client and server. These are for UX
 * gating only — the authoritative checks live in Convex functions and route
 * handlers (PRD 5.17). Never rely on these alone to protect data.
 */

export interface SessionUserLike {
  role: Role;
  status: "active" | "disabled";
}

export function isAdmin(user: SessionUserLike | null | undefined): boolean {
  return user?.role === "admin";
}

export function isActive(user: SessionUserLike | null | undefined): boolean {
  return user?.status === "active";
}

/** A signed-in, active user may start a saved voice/chat session. */
export function canStartSession(
  user: SessionUserLike | null | undefined,
): boolean {
  return !!user && isActive(user);
}

export function canAccessAdmin(
  user: SessionUserLike | null | undefined,
): boolean {
  return isAdmin(user) && isActive(user);
}

/** App route prefixes that require authentication. */
export const PROTECTED_PREFIXES = ["/chat", "/conversations", "/settings"];

/** Route prefixes that require the admin role. */
export const ADMIN_PREFIXES = ["/admin"];

export function isProtectedPath(pathname: string): boolean {
  return [...PROTECTED_PREFIXES, ...ADMIN_PREFIXES].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

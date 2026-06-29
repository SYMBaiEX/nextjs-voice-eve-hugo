import "server-only";
import { fetchQuery, fetchMutation, fetchAction } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

/**
 * Server-side Convex access for Route Handlers, Server Components, and the Hugo
 * agent tools. All calls carry the authenticated user's JWT so Convex enforces
 * the same per-user authorization as the client (PRD 5.17).
 */

export { fetchQuery, fetchMutation, fetchAction };

/** The current request's Convex auth token, or undefined for guests. */
export async function authToken(): Promise<string | undefined> {
  return await convexAuthNextjsToken();
}

/** Token that throws when unauthenticated — use to gate protected routes. */
export async function requireAuthToken(): Promise<string> {
  const token = await convexAuthNextjsToken();
  if (!token) throw new Error("Unauthorized");
  return token;
}

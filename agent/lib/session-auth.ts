import type { Id } from "@/convex/_generated/dataModel";
import type { HugoToolContext } from "@/hugo-agent/tool-logic";

/**
 * Bridges Eve's per-session identity back to Hugo's Convex auth (PRD 5.17).
 *
 * `agent/channels/eve.ts`'s `onMessage` reads the `x-hugo-token` /
 * `x-hugo-conversation-id` headers the bridge (`lib/eve-bridge.ts`) attaches
 * to every server-to-server call, and stashes them in the session's
 * `SessionAuthContext.attributes`. Every tool, dynamic-tool resolver, and
 * dynamic-instructions resolver reads them back here — the SAME Convex JWT is
 * then passed to `fetchQuery`/`fetchMutation`, so Convex's own verification
 * remains the actual authority (never trust the identity as given; it's just
 * a carrier for the token Convex will independently check).
 */

interface SessionAuthContextLike {
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
  readonly principalType: string;
}

interface SessionLike {
  readonly session: {
    readonly auth: {
      readonly current: SessionAuthContextLike | null;
    };
  };
}

function firstAttr(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : (value as string);
}

/** The current session's Hugo identity, for tools/instructions to act on. */
export function hugoToolContext(ctx: SessionLike): HugoToolContext {
  const auth = ctx.session.auth.current;
  const token = firstAttr(auth?.attributes.convexToken);
  if (!token) {
    throw new Error(
      "Missing Hugo session auth — this agent is only reachable through Hugo's own server bridge.",
    );
  }
  const conversationId = firstAttr(auth?.attributes.conversationId) as
    | Id<"conversations">
    | undefined;
  return {
    token,
    conversationId,
    role: auth?.principalType === "admin" ? "admin" : "user",
  };
}

/** Whether the current session belongs to an admin (gates admin-only tools). */
export function isAdminSession(ctx: SessionLike): boolean {
  return ctx.session.auth.current?.principalType === "admin";
}

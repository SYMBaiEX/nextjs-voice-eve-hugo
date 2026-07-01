import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

/**
 * Eve HTTP channel for Hugo's text-chat runtime.
 *
 * **Route-level auth** (`vercelOidc()`, `localDev()`) admits only trusted
 * server callers — the same Vercel project (production) or localhost (dev).
 * The browser never talks to Eve directly; every request comes from Hugo's
 * own server-to-server bridge (`lib/eve-bridge.ts`, called from
 * `app/api/chat` and `app/api/agent/hugo`), which already ran the app's full
 * policy (auth, rate limit, daily usage cap, maintenance mode) before ever
 * reaching here.
 *
 * **`onMessage`** reads the `x-hugo-token` / `x-hugo-user-id` /
 * `x-hugo-conversation-id` / `x-hugo-role` headers the bridge attaches to
 * every call and constructs the session's REAL identity from them —
 * overriding the route-level auth (which only proves "this is our server,"
 * not which user). Tools/instructions read this back via
 * `ctx.session.auth.current` (see `agent/lib/session-auth.ts`) and pass the
 * same Convex JWT to every Convex call, so Convex's own verification remains
 * the actual authority (never trust the identity as given).
 */
export default eveChannel({
  auth: [vercelOidc(), localDev()],
  onMessage(ctx) {
    const token = ctx.eve.request.headers.get("x-hugo-token");
    const userId = ctx.eve.request.headers.get("x-hugo-user-id");
    const conversationId = ctx.eve.request.headers.get("x-hugo-conversation-id");
    const role = ctx.eve.request.headers.get("x-hugo-role");

    if (!token || !userId) {
      // No identity supplied — reject rather than silently running anonymously.
      return { auth: null };
    }

    return {
      auth: {
        principalId: userId,
        principalType: role === "admin" ? "admin" : "user",
        subject: userId,
        authenticator: "hugo-bridge",
        attributes: {
          convexToken: [token],
          ...(conversationId ? { conversationId: [conversationId] } : {}),
        },
      },
    };
  },
});

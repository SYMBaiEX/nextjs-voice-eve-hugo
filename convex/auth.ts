import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Hugo authentication (PRD 5.1).
 *
 * Self-contained email + password auth via Convex Auth — no third-party keys
 * required. On account creation the default-admin email is granted the `admin`
 * role server-side; every other account is a `user`. Role is therefore set in
 * trusted backend code and can never be spoofed from the client.
 */

const DEFAULT_ADMIN_EMAIL = (
  process.env.DEFAULT_ADMIN_EMAIL ?? "solsymbaiex@gmail.com"
).toLowerCase();
const DAILY_VOICE_MINUTES_LIMIT = Number(
  process.env.DAILY_VOICE_MINUTES_LIMIT ?? 30,
);
const DAILY_TEXT_MESSAGES_LIMIT = Number(
  process.env.DAILY_TEXT_MESSAGES_LIMIT ?? 200,
);

/** Whether "Sign in with Vercel" is configured on this Convex deployment. Also
 *  surfaced to the client (settings.getPublic) so the sign-in button only shows
 *  when it will actually work. */
export const isVercelSignInEnabled = () => !!process.env.AUTH_VERCEL_ID;

/**
 * Sign in with Vercel — Vercel's OAuth 2.0 / OIDC identity provider
 * (https://vercel.com/docs/sign-in-with-vercel). GA since Nov 2025; a
 * general-purpose "log in with your Vercel account" provider, not a Marketplace
 * integration. There's no built-in Auth.js preset, so it's wired as a custom
 * OAuth provider using the documented endpoints. PKCE (S256) is mandatory and
 * is Convex Auth's default; `state` is added for CSRF protection. We use the
 * userinfo endpoint (not the id_token) for the profile, so no JWKS handling.
 *
 * Only registered when its credentials are set, so the app ships safely before
 * the OAuth app exists. Setup (all external, one-time):
 *  1. Vercel -> your Team -> Settings -> Apps -> Create. Enable the `openid`,
 *     `email`, `profile` scopes; generate a client secret.
 *  2. Register the callback URL PER Convex deployment (the `.convex.site`
 *     HTTP-actions domain, NOT the Vercel app URL):
 *        <CONVEX_SITE_URL>/api/auth/callback/vercel
 *  3. Set the secrets on the CONVEX deployment (not .env.local / Vercel):
 *        npx convex env set AUTH_VERCEL_ID <client-id>
 *        npx convex env set AUTH_VERCEL_SECRET <client-secret>
 *     (repeat with `--prod` for production), then redeploy Convex.
 */
interface VercelProfile {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

function Vercel() {
  return {
    id: "vercel",
    name: "Vercel",
    type: "oauth" as const,
    // Required even though we hand-specify authorization/token/userinfo below
    // (skipping OIDC discovery) — @convex-dev/auth's oAuthConfigToInternalProvider
    // falls back to a literal placeholder issuer ("theremustbeastringhere.dev")
    // when `issuer` is omitted. Vercel issues a real ID token (because we
    // request the `openid` scope) whose "iss" claim oauth4webapi validates
    // UNCONDITIONALLY once an id_token is present, regardless of provider type
    // — so the placeholder must match Vercel's real issuer or every callback
    // fails with "unexpected JWT iss claim value" and bounces back to sign-in.
    issuer: "https://vercel.com",
    clientId: process.env.AUTH_VERCEL_ID,
    clientSecret: process.env.AUTH_VERCEL_SECRET,
    authorization: {
      url: "https://vercel.com/oauth/authorize",
      params: { scope: "openid email profile" },
    },
    token: "https://api.vercel.com/login/oauth/token",
    userinfo: "https://api.vercel.com/login/oauth/userinfo",
    checks: ["pkce", "state"] as ("pkce" | "state")[],
    profile(profile: VercelProfile) {
      return {
        id: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.preferred_username,
        image: profile.picture,
      };
    },
  };
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Normalize email and carry an optional display name from the sign-up form.
      profile(params) {
        const email = String(params.email ?? "").toLowerCase().trim();
        // Build an index-signature-safe object — the provider profile type
        // forbids `undefined` values, so only attach `name` when present.
        const result: Record<string, string> & { email: string } = { email };
        if (typeof params.name === "string" && params.name.trim().length > 0) {
          result.name = params.name.trim();
        }
        return result;
      },
    }),
    // Registered only when configured (see isVercelSignInEnabled) so the OAuth
    // routes aren't set up with a missing client id.
    ...(isVercelSignInEnabled() ? [Vercel()] : []),
  ],
  callbacks: {
    /**
     * Owns user-document creation/update. New accounts get Hugo profile
     * defaults; the default-admin email is elevated to `admin`. Existing
     * accounts just refresh activity timestamps.
     */
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const now = Date.now();
      const email =
        typeof profile.email === "string"
          ? profile.email.toLowerCase().trim()
          : undefined;
      const name =
        typeof profile.name === "string" ? profile.name : undefined;
      const image =
        typeof (profile as { image?: unknown }).image === "string"
          ? (profile as { image?: string }).image
          : undefined;

      if (existingUserId) {
        const patch: Record<string, unknown> = {
          lastSeenAt: now,
          updatedAt: now,
        };
        if (name) patch.name = name;
        if (image) patch.image = image;
        await ctx.db.patch(existingUserId, patch);
        return existingUserId;
      }

      const role = email && email === DEFAULT_ADMIN_EMAIL ? "admin" : "user";

      return await ctx.db.insert("users", {
        email,
        name,
        image,
        role,
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        preferences: { theme: "dark" },
        usageLimits: {
          dailyVoiceMinutes: DAILY_VOICE_MINUTES_LIMIT,
          dailyTextMessages: DAILY_TEXT_MESSAGES_LIMIT,
        },
      });
    },
  },
});

import "server-only";
import { createGateway, gateway, type GatewayProvider } from "@ai-sdk/gateway";
import { fetchQuery } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptSecret } from "@/lib/crypto";
import { isAiConfigured } from "@/lib/ai";

/**
 * Per-user AI Gateway resolution (BYOK, server-only).
 *
 * The admin (`solsymbaiex@gmail.com`) keeps using the server key / deployment
 * OIDC — the singleton `gateway`. Every other user brings their own Vercel AI
 * Gateway key: we read their ciphertext from Convex, decrypt it server-side,
 * and scope a `createGateway({ apiKey })` provider to just them, so their model
 * catalog, usage, and billing are fully independent of the admin's.
 *
 * A non-admin without a working key is reported `configured: false` so AI
 * routes can soft-gate (HTTP 402, "add your key") instead of calling the
 * gateway with no credentials. The returned `gw` is still the singleton in that
 * case (never used — the route gates first).
 */

export interface UserGateway {
  /** The provider to resolve models / mint tokens through for this request. */
  gw: GatewayProvider;
  /** Per-key cache key for the model catalog (one catalog per distinct key). */
  cacheKey: string;
  /** Whether this request can actually authenticate to the gateway. */
  configured: boolean;
}

interface MeForGateway {
  _id: string;
  role?: string;
  hasGatewayKey?: boolean;
}

export async function getUserGateway(
  me: MeForGateway,
  token: string,
): Promise<UserGateway> {
  // Admin: server key / deployment OIDC, shared catalog.
  if (me.role === "admin") {
    return { gw: gateway, cacheKey: "server", configured: isAiConfigured() };
  }

  // Non-admin without a stored key — soft-gated.
  if (!me.hasGatewayKey) {
    return { gw: gateway, cacheKey: `user:${me._id}`, configured: false };
  }

  // Non-admin with a key — decrypt it and scope a provider to them.
  const encrypted = await fetchQuery(
    api.users.gatewayKeyForSelf,
    {},
    { token },
  ).catch(() => null);
  const apiKey = encrypted ? decryptSecret(encrypted) : null;
  if (!apiKey) {
    // Stored key is unreadable (missing server secret / tampering) — soft-gate.
    return { gw: gateway, cacheKey: `user:${me._id}`, configured: false };
  }
  return {
    gw: createGateway({ apiKey }),
    cacheKey: `user:${me._id}`,
    configured: true,
  };
}

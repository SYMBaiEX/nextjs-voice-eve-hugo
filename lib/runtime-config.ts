import "server-only";
import { fetchQuery } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

/**
 * Cached admin runtime settings (PRD 5.8).
 *
 * `settings.getRuntime` returns GLOBAL values (default models/voice, maintenance
 * mode) — identical for every user — yet it's hit on every chat, voice, and
 * models request. We cache the result in-process for a short TTL so the hot
 * paths don't re-query Convex each time; an admin's Settings change still
 * applies within `TTL_MS`.
 */

export interface RuntimeConfig {
  defaultRealtimeModel: string;
  defaultTextModel: string;
  defaultVoice: string;
  maintenanceMode: boolean;
}

let cache: { value: RuntimeConfig; at: number } | null = null;
const TTL_MS = 30_000;

/** The admin runtime config, cached for a short TTL. Returns null only if the
 *  query fails and nothing is cached yet (callers treat that as "no overrides").
 *  A token is required because the query is auth-gated, but the result is global. */
export async function getRuntimeConfig(
  token: string,
): Promise<RuntimeConfig | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const value = await fetchQuery(api.settings.getRuntime, {}, { token });
    cache = { value, at: Date.now() };
    return value;
  } catch {
    // Transient failure: serve a slightly-stale value rather than dropping
    // overrides mid-conversation; null only before the first successful read.
    return cache?.value ?? null;
  }
}

/** Invalidate the cache (e.g. after an admin settings mutation in the same
 *  process). Best-effort — the TTL bounds staleness regardless. */
export function invalidateRuntimeConfig(): void {
  cache = null;
}

import "server-only";

/**
 * Lightweight in-memory sliding-window rate limiter for realtime token minting
 * (PRD 5.17). Best-effort per-instance; for multi-region production move this to
 * a shared store (Convex, Upstash, or Vercel KV). Documented intentionally.
 */

const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const retryAfterMs = windowMs - (now - hits[0]);
    buckets.set(key, hits);
    return { ok: false, retryAfterMs };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterMs: 0 };
}

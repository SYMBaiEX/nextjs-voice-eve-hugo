import "server-only";
import type { GatewayProvider } from "@ai-sdk/gateway";
import {
  AVAILABLE_REALTIME_MODELS,
  AVAILABLE_TEXT_MODELS,
  type ModelOption,
} from "@/lib/constants";

/**
 * Server-side model catalog (PRD 5.8/5.11), per gateway key (BYOK).
 *
 * The models the AI Gateway actually serves depend on *which key* makes the
 * call, so the catalog and the resolution helpers take a user-scoped
 * `GatewayProvider` + a `cacheKey` (admin → "server"; each BYOK user →
 * "user:<id>"). The catalog is cached per key. `resolve*Model` maps a requested
 * model to one that is guaranteed to exist for that key — so a typo'd env var,
 * admin default, or stale preference can never 404 a chat or voice session.
 */

export interface ModelCatalog {
  text: ModelOption[];
  realtime: ModelOption[];
  textIds: Set<string>;
  realtimeIds: Set<string>;
}

const cache = new Map<string, { catalog: ModelCatalog; at: number }>();
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

/** Stable, widely-available fallbacks, tried in order, if a requested model
 *  isn't in the catalog. The last resort is "any available model". */
const TEXT_FALLBACKS = [
  "minimax/minimax-m2.7",
  "openai/gpt-5.5",
  "openai/gpt-5",
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4.5",
];
const REALTIME_FALLBACKS = ["openai/gpt-realtime-2", "openai/gpt-realtime-mini"];

function family(id: string): string {
  return id.includes("/") ? id.slice(0, id.indexOf("/")) : id;
}

function sortModels(a: ModelOption, b: ModelOption): number {
  const fa = a.hint ?? "";
  const fb = b.hint ?? "";
  return fa === fb ? a.label.localeCompare(b.label) : fa.localeCompare(fb);
}

/** Drop the oldest cache entries once the map grows past the cap. */
function pruneCache() {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const oldestFirst = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of oldestFirst) {
    if (cache.size <= MAX_CACHE_ENTRIES) break;
    cache.delete(key);
  }
}

/** The model catalog for a specific gateway key, cached per `cacheKey`. Returns
 *  null if the gateway isn't configured for this user or is unreachable (callers
 *  then trust the requested model / curated lists). */
export async function getModelCatalog(
  gw: GatewayProvider,
  cacheKey: string,
  configured: boolean,
): Promise<ModelCatalog | null> {
  if (!configured) return null;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.catalog;
  try {
    const { models } = await gw.getAvailableModels();
    const toOption = (m: { id: string; name?: string }): ModelOption => ({
      id: m.id,
      label: m.name || m.id,
      hint: family(m.id),
    });
    const text = models
      .filter((m) => m.modelType === "language")
      .map(toOption)
      .sort(sortModels);
    const realtime = models
      .filter((m) => m.modelType === "realtime")
      .map(toOption)
      .sort(sortModels);
    const catalog: ModelCatalog = {
      text: text.length ? text : [...AVAILABLE_TEXT_MODELS],
      realtime: realtime.length ? realtime : [...AVAILABLE_REALTIME_MODELS],
      textIds: new Set(text.map((m) => m.id)),
      realtimeIds: new Set(realtime.map((m) => m.id)),
    };
    cache.set(cacheKey, { catalog, at: Date.now() });
    pruneCache();
    return catalog;
  } catch {
    return null;
  }
}

function ensure(
  requested: string,
  ids: Set<string>,
  fallbacks: string[],
): string {
  if (ids.size === 0 || ids.has(requested)) return requested;
  for (const f of fallbacks) if (ids.has(f)) return f;
  const first = ids.values().next().value;
  return first ?? requested;
}

/** Resolve `requested` to a text model that exists for this key (or itself if
 *  the catalog can't be loaded). */
export async function resolveTextModel(
  requested: string,
  gw: GatewayProvider,
  cacheKey: string,
  configured: boolean,
): Promise<string> {
  const cat = await getModelCatalog(gw, cacheKey, configured);
  if (!cat) return requested;
  return ensure(requested, cat.textIds, TEXT_FALLBACKS);
}

/** Resolve `requested` to a realtime model that exists for this key. */
export async function resolveRealtimeModel(
  requested: string,
  gw: GatewayProvider,
  cacheKey: string,
  configured: boolean,
): Promise<string> {
  const cat = await getModelCatalog(gw, cacheKey, configured);
  if (!cat) return requested;
  return ensure(requested, cat.realtimeIds, REALTIME_FALLBACKS);
}

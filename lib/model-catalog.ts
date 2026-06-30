import "server-only";
import { gateway } from "@ai-sdk/gateway";
import { getRealtimeModel, getTextModel, isAiConfigured } from "@/lib/ai";
import {
  AVAILABLE_REALTIME_MODELS,
  AVAILABLE_TEXT_MODELS,
  type ModelOption,
} from "@/lib/constants";

/**
 * Server-side model catalog (PRD 5.8/5.11).
 *
 * Single, cached source of the models the AI Gateway actually serves for this
 * key (`gateway.getAvailableModels()`), plus helpers that resolve a requested
 * model to one that is guaranteed to exist — so a typo'd env var, admin
 * default, or stale user preference can never 404 a chat or voice session.
 */

export interface ModelCatalog {
  text: ModelOption[];
  realtime: ModelOption[];
  textIds: Set<string>;
  realtimeIds: Set<string>;
}

let cache: { catalog: ModelCatalog; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

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

/** The full catalog, cached. Returns null if the gateway isn't configured or is
 *  unreachable (callers then trust the requested model / curated lists). */
export async function getModelCatalog(): Promise<ModelCatalog | null> {
  if (!isAiConfigured()) return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.catalog;
  try {
    const { models } = await gateway.getAvailableModels();
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
    cache = { catalog, at: Date.now() };
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

/** Resolve `requested` to a text model that exists in the catalog (or itself if
 *  the catalog can't be loaded). */
export async function resolveTextModel(requested: string): Promise<string> {
  const cat = await getModelCatalog();
  if (!cat) return requested;
  return ensure(requested, cat.textIds, TEXT_FALLBACKS);
}

/** Resolve `requested` to a realtime model that exists in the catalog. */
export async function resolveRealtimeModel(requested: string): Promise<string> {
  const cat = await getModelCatalog();
  if (!cat) return requested;
  return ensure(requested, cat.realtimeIds, REALTIME_FALLBACKS);
}

/** Convenience: the effective default text/realtime model, validated. */
export async function defaultModels(
  runtime: { defaultTextModel?: string; defaultRealtimeModel?: string } | null,
): Promise<{ text: string; realtime: string }> {
  return {
    text: await resolveTextModel(getTextModel(runtime?.defaultTextModel)),
    realtime: await resolveRealtimeModel(
      getRealtimeModel(runtime?.defaultRealtimeModel),
    ),
  };
}

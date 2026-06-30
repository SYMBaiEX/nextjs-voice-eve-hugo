import { NextResponse } from "next/server";
import { gateway } from "@ai-sdk/gateway";
import { fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { getRealtimeModel, getTextModel, isAiConfigured } from "@/lib/ai";
import {
  AVAILABLE_REALTIME_MODELS,
  AVAILABLE_TEXT_MODELS,
  type ModelOption,
} from "@/lib/constants";

/**
 * GET /api/models — the selectable models for the composer.
 *
 * Returns the FULL current model catalog the AI Gateway serves for this key
 * (via `gateway.getAvailableModels()`), split into text (`language`) and
 * realtime (`voice`) models, plus the effective default of each (admin/global
 * setting → env). A BYOK / open-source deployment therefore reflects exactly
 * the models its own key can use. Falls back to the curated lists in
 * `lib/constants.ts` if the gateway can't be reached.
 */

interface ModelsPayload {
  text: ModelOption[];
  realtime: ModelOption[];
  defaultText: string;
  defaultRealtime: string;
}

let cache: { text: ModelOption[]; realtime: ModelOption[]; at: number } | null =
  null;
const TTL_MS = 10 * 60 * 1000;
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Model family from the id prefix (anthropic, openai, …) — more intuitive than
 *  the hosting provider, and what users search by. */
function family(id: string): string {
  return id.includes("/") ? id.slice(0, id.indexOf("/")) : id;
}

function sortModels(a: ModelOption, b: ModelOption): number {
  const fa = a.hint ?? "";
  const fb = b.hint ?? "";
  return fa === fb ? a.label.localeCompare(b.label) : fa.localeCompare(fb);
}

export async function GET() {
  const token = await authToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Effective defaults: admin/global setting → env. Shown when a user hasn't
  // picked a model, and what the routes actually use in that case.
  const runtime = await fetchQuery(api.settings.getRuntime, {}, { token }).catch(
    () => null,
  );
  const defaultText = getTextModel(runtime?.defaultTextModel);
  const defaultRealtime = getRealtimeModel(runtime?.defaultRealtimeModel);

  const respond = (text: ModelOption[], realtime: ModelOption[]) =>
    NextResponse.json(
      { text, realtime, defaultText, defaultRealtime } satisfies ModelsPayload,
      { headers: NO_STORE },
    );

  if (!isAiConfigured()) {
    return respond([...AVAILABLE_TEXT_MODELS], [...AVAILABLE_REALTIME_MODELS]);
  }
  if (cache && Date.now() - cache.at < TTL_MS) {
    return respond(cache.text, cache.realtime);
  }

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

    const result = {
      text: text.length ? text : [...AVAILABLE_TEXT_MODELS],
      realtime: realtime.length ? realtime : [...AVAILABLE_REALTIME_MODELS],
    };
    cache = { ...result, at: Date.now() };
    return respond(result.text, result.realtime);
  } catch {
    return respond([...AVAILABLE_TEXT_MODELS], [...AVAILABLE_REALTIME_MODELS]);
  }
}

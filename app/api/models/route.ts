import { NextResponse } from "next/server";
import { gateway } from "@ai-sdk/gateway";
import { authToken } from "@/lib/convex-server";
import { isAiConfigured } from "@/lib/ai";
import {
  AVAILABLE_REALTIME_MODELS,
  AVAILABLE_TEXT_MODELS,
  type ModelOption,
} from "@/lib/constants";

/**
 * GET /api/models — the selectable models for the composer.
 *
 * Returns the curated text + realtime model lists, but filtered to the ids the
 * AI Gateway actually serves for this key, so a user can never pick a model
 * that would fail (and a BYOK deployment automatically reflects its own access).
 * Falls back to the full curated lists if the gateway can't be reached.
 */

interface Cached {
  text: ModelOption[];
  realtime: ModelOption[];
  at: number;
}
let cache: Cached | null = null;
const TTL_MS = 10 * 60 * 1000;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fallback() {
  return {
    text: [...AVAILABLE_TEXT_MODELS],
    realtime: [...AVAILABLE_REALTIME_MODELS],
  };
}

export async function GET() {
  const token = await authToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(fallback(), { headers: NO_STORE });
  }
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(
      { text: cache.text, realtime: cache.realtime },
      { headers: NO_STORE },
    );
  }

  try {
    const { models } = await gateway.getAvailableModels();
    const available = new Set(models.map((m) => m.id));
    const keep = (list: readonly ModelOption[]) => {
      const filtered = list.filter((m) => available.has(m.id));
      return filtered.length > 0 ? filtered : [...list];
    };
    const result = {
      text: keep(AVAILABLE_TEXT_MODELS),
      realtime: keep(AVAILABLE_REALTIME_MODELS),
    };
    cache = { ...result, at: Date.now() };
    return NextResponse.json(result, { headers: NO_STORE });
  } catch {
    return NextResponse.json(fallback(), { headers: NO_STORE });
  }
}

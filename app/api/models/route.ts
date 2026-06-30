import { NextResponse } from "next/server";
import { fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import {
  AVAILABLE_REALTIME_MODELS,
  AVAILABLE_TEXT_MODELS,
} from "@/lib/constants";
import { resolveUserModel } from "@/lib/ai";
import { getUserGateway } from "@/lib/user-gateway";
import {
  getModelCatalog,
  resolveRealtimeModel,
  resolveTextModel,
} from "@/lib/model-catalog";

/**
 * GET /api/models — the selectable models for the composer.
 *
 * Returns the full current model catalog the AI Gateway serves for this key
 * (split into text + realtime), plus the effective, gateway-validated default of
 * each. A BYOK / open-source deployment reflects exactly the models its key can
 * use; falls back to the curated lists in `lib/constants.ts` if the gateway
 * can't be reached.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const token = await authToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [me, runtime] = await Promise.all([
    fetchQuery(api.users.currentUser, {}, { token }).catch(() => null),
    fetchQuery(api.settings.getRuntime, {}, { token }).catch(() => null),
  ]);

  // No profile yet: curated lists + platform defaults (no gateway call).
  if (!me) {
    return NextResponse.json(
      {
        text: [...AVAILABLE_TEXT_MODELS],
        realtime: [...AVAILABLE_REALTIME_MODELS],
        defaultText: resolveUserModel({}, runtime, "text"),
        defaultRealtime: resolveUserModel({}, runtime, "realtime"),
      },
      { headers: NO_STORE },
    );
  }

  // The catalog reflects the caller's own key (admin → server; BYOK → their key);
  // a keyless non-admin falls back to the curated lists + the platform default.
  const { gw, cacheKey, configured } = await getUserGateway(me, token);
  const catalog = await getModelCatalog(gw, cacheKey, configured);
  const [defaultText, defaultRealtime] = await Promise.all([
    resolveTextModel(resolveUserModel(me, runtime, "text"), gw, cacheKey, configured),
    resolveRealtimeModel(
      resolveUserModel(me, runtime, "realtime"),
      gw,
      cacheKey,
      configured,
    ),
  ]);

  return NextResponse.json(
    {
      text: catalog?.text ?? [...AVAILABLE_TEXT_MODELS],
      realtime: catalog?.realtime ?? [...AVAILABLE_REALTIME_MODELS],
      defaultText,
      defaultRealtime,
    },
    { headers: NO_STORE },
  );
}

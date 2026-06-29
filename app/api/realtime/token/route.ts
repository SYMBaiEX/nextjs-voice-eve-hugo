import { NextResponse } from "next/server";
import { gateway } from "@ai-sdk/gateway";
import { fetchQuery, fetchMutation, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getRealtimeModel, isAiConfigured } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { REALTIME_TOKEN_RATE } from "@/lib/constants";
import { track } from "@/lib/telemetry";

/**
 * POST /api/realtime/token (PRD 5.4, 5.11, 5.17)
 *
 * Authenticated, rate-limited. Mints a SHORT-LIVED AI Gateway realtime token
 * server-side and returns only `{ token, url }`. The AI_GATEWAY_API_KEY never
 * leaves the server. Attaches to the caller's existing voiceSession (passed as
 * ?session=ID) and flips it to "connecting". If voice is unavailable (no key,
 * gateway error) the client falls back to text chat.
 */
export async function POST(req: Request) {
  const token = await authToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user rate limit on token minting.
  const limit = rateLimit(
    `realtime-token:${me._id}`,
    REALTIME_TOKEN_RATE.max,
    REALTIME_TOKEN_RATE.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many session attempts. Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const url = new URL(req.url);
  const sessionParam = url.searchParams.get("session") as
    | Id<"voiceSessions">
    | null;

  // Mint for the same admin-configured realtime model the session was created
  // with, so the token and the client codec agree.
  const runtime = await fetchQuery(api.settings.getRuntime, {}, { token }).catch(
    () => null,
  );
  const model = getRealtimeModel(runtime?.defaultRealtimeModel);

  if (!isAiConfigured()) {
    // Voice unavailable without gateway auth — signal text fallback.
    if (sessionParam) {
      await fetchMutation(
        api.voiceSessions.updateStatus,
        {
          voiceSessionId: sessionParam,
          status: "failed",
          errorCode: "no_gateway_key",
          errorMessage: "AI Gateway key not configured.",
        },
        { token },
      ).catch(() => {});
    }
    return NextResponse.json(
      { error: "Realtime voice is not configured. Falling back to text chat." },
      { status: 503 },
    );
  }

  try {
    const { token: realtimeToken, url: realtimeUrl } =
      await gateway.experimental_realtime.getToken({ model });

    if (sessionParam) {
      await fetchMutation(
        api.voiceSessions.updateStatus,
        { voiceSessionId: sessionParam, status: "connecting" },
        { token },
      ).catch(() => {});
    }

    track("realtime_token_minted", { model, userId: me._id });

    // Only the token + url cross to the browser — never the API key.
    return NextResponse.json({ token: realtimeToken, url: realtimeUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mint token";
    if (sessionParam) {
      await fetchMutation(
        api.voiceSessions.updateStatus,
        {
          voiceSessionId: sessionParam,
          status: "failed",
          errorCode: "token_mint_failed",
          errorMessage: message,
        },
        { token },
      ).catch(() => {});
    }
    track("realtime_token_failed", { model, error: message });
    return NextResponse.json(
      { error: "Could not start realtime voice. Falling back to text chat." },
      { status: 502 },
    );
  }
}

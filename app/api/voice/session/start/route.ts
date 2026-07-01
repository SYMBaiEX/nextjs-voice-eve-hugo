import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildHugoSystemPrompt,
  getDefaultVoice,
  resolveUserModel,
} from "@/lib/ai";
import { getUserGateway } from "@/lib/user-gateway";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { resolveRealtimeModel } from "@/lib/model-catalog";
import { clientSafeTools } from "@/hugo-agent/tools/registry";
import { isVoiceLimitReached } from "@/lib/usage";
import { track } from "@/lib/telemetry";
import { rateLimit } from "@/lib/rate-limit";
import {
  REALTIME_TOKEN_RATE,
  REALTIME_TURN_SILENCE_DURATION_MS,
} from "@/lib/constants";
import { routeErrorMessage, statusFromConvexError } from "@/lib/route-errors";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
} as const;

const Body = z.object({ conversationId: z.string().optional() });

/**
 * POST /api/voice/session/start (PRD 5.4, 5.11)
 *
 * Authenticated. Creates (or attaches to) a conversation + voiceSession and
 * returns the ids + client-safe config the browser needs. Enforces the user's
 * daily voice-minute limit before allowing a session. Returns no provider keys.
 */
export async function POST(req: Request) {
  const token = await authToken();
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const parsedBody = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid voice session request." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const body = parsedBody.data;

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const limit = rateLimit(
    `voice-session-start:${me._id}`,
    REALTIME_TOKEN_RATE.max,
    REALTIME_TOKEN_RATE.windowMs,
  );
  if (!limit.ok) {
    track("voice_session_start_rate_limited", { userId: me._id });
    return NextResponse.json(
      { error: "Too many session attempts. Slow down a moment." },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }

  // Resolve the caller's gateway (admin → server key; everyone else → BYOK).
  const { gw, cacheKey, configured } = await getUserGateway(me, token);
  if (!configured) {
    return me.role === "admin"
      ? NextResponse.json(
          { error: "Realtime voice is not configured. Try text chat instead." },
          { status: 503, headers: NO_STORE_HEADERS },
        )
      : NextResponse.json(
          {
            error: "Add your Vercel AI Gateway key in Settings to use voice.",
            code: "gateway_key_required",
          },
          { status: 402, headers: NO_STORE_HEADERS },
        );
  }

  // Enforce daily voice-minute limit.
  const usage = await fetchQuery(api.usageEvents.todayForUser, {}, { token });
  if (
    isVoiceLimitReached(
      { textMessages: usage.textMessages, voiceMinutes: usage.voiceMinutes },
      usage.limits,
    )
  ) {
    return NextResponse.json(
      { error: "Daily voice limit reached. Try text chat or come back tomorrow." },
      { status: 429, headers: NO_STORE_HEADERS },
    );
  }

  // Runtime config from admin Settings (model, voice, maintenance mode), cached.
  const runtime = await getRuntimeConfig(token);
  if (runtime?.maintenanceMode && me?.role !== "admin") {
    return NextResponse.json(
      { error: "Hugo is in maintenance mode. Please try again shortly." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  // Reuse the provided conversation or open a fresh voice conversation.
  let conversationId = body.conversationId as Id<"conversations"> | undefined;
  // The user's own preference wins; the admin global default applies only to the
  // admin. Validated against the gateway catalog so a bad id can't break the
  // session.
  const model = await resolveRealtimeModel(
    resolveUserModel(me, runtime, "realtime"),
    gw,
    cacheKey,
    configured,
  );
  const voice = getDefaultVoice(runtime?.defaultVoice);

  let voiceSessionId: Id<"voiceSessions">;
  try {
    if (!conversationId) {
      conversationId = await fetchMutation(
        api.conversations.create,
        { title: "Voice session", mode: "voice" },
        { token },
      );
    }

    voiceSessionId = await fetchMutation(
      api.voiceSessions.create,
      { conversationId, provider: "ai-gateway", model, voice },
      { token },
    );
  } catch (err) {
    const message = routeErrorMessage(err, "Could not start voice session.");
    track("voice_session_start_failed", {
      error: message,
      userId: me._id,
    });
    return NextResponse.json(
      { error: "Could not start voice session." },
      { status: statusFromConvexError(err), headers: NO_STORE_HEADERS },
    );
  }

  const memories = await fetchQuery(api.memories.listOwn, {}, { token }).catch(
    () => [] as { key: string; value: string }[],
  );
  const instructions = buildHugoSystemPrompt({
    mode: "voice",
    userName: me.name,
    role: me.role,
    memories: memories.map((m) => ({ key: m.key, value: m.value })),
  });

  await fetchMutation(
    api.agentEvents.log,
    {
      eventType: "voice_session_started",
      status: "ok",
      conversationId,
      voiceSessionId,
    },
    { token },
  ).catch(() => {});

  track("voice_session_started", {
    conversationId,
    model,
    userId: me._id,
    voice,
    voiceSessionId,
  });

  return NextResponse.json(
    {
      conversationId,
      voiceSessionId,
      model,
      voice,
      sessionConfig: {
        inputAudioTranscription: {},
        instructions,
        voice,
        turnDetection: {
          type: "server-vad",
          silenceDurationMs: REALTIME_TURN_SILENCE_DURATION_MS,
        },
      },
      tools: clientSafeTools(me.role),
    },
    { headers: NO_STORE_HEADERS },
  );
}

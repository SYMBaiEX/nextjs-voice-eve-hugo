import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildHugoSystemPrompt,
  getRealtimeModel,
  getDefaultVoice,
  isAiConfigured,
} from "@/lib/ai";
import { clientSafeTools } from "@/agent/hugo/tools/registry";
import { isVoiceLimitReached } from "@/lib/usage";
import { track } from "@/lib/telemetry";
import { rateLimit } from "@/lib/rate-limit";
import { REALTIME_TOKEN_RATE } from "@/lib/constants";
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

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "Realtime voice is not configured. Try text chat instead." },
      { status: 503, headers: NO_STORE_HEADERS },
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

  // Runtime config from admin Settings (model, voice, maintenance mode).
  const runtime = await fetchQuery(api.settings.getRuntime, {}, { token }).catch(
    () => null,
  );
  if (runtime?.maintenanceMode && me?.role !== "admin") {
    return NextResponse.json(
      { error: "Hugo is in maintenance mode. Please try again shortly." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  // Reuse the provided conversation or open a fresh voice conversation.
  let conversationId = body.conversationId as Id<"conversations"> | undefined;
  // Per-user realtime model preference wins, then admin/global default, then env.
  const model = getRealtimeModel(
    me.preferences?.preferredRealtimeModel ?? runtime?.defaultRealtimeModel,
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
        turnDetection: { type: "server-vad" },
      },
      tools: clientSafeTools(me.role),
    },
    { headers: NO_STORE_HEADERS },
  );
}

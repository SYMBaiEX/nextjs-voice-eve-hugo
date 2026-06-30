import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getRealtimeModel, getDefaultVoice, isAiConfigured } from "@/lib/ai";
import { clientSafeTools } from "@/agent/hugo/tools/registry";
import { isVoiceLimitReached } from "@/lib/usage";
import { track } from "@/lib/telemetry";
import { rateLimit } from "@/lib/rate-limit";
import { REALTIME_TOKEN_RATE } from "@/lib/constants";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { conversationId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "Realtime voice is not configured. Try text chat instead." },
      { status: 503 },
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
      { status: 429 },
    );
  }

  // Runtime config from admin Settings (model, voice, maintenance mode).
  const runtime = await fetchQuery(api.settings.getRuntime, {}, { token }).catch(
    () => null,
  );
  if (runtime?.maintenanceMode && me?.role !== "admin") {
    return NextResponse.json(
      { error: "Hugo is in maintenance mode. Please try again shortly." },
      { status: 503 },
    );
  }

  // Reuse the provided conversation or open a fresh voice conversation.
  let conversationId = body.conversationId as Id<"conversations"> | undefined;
  if (!conversationId) {
    conversationId = await fetchMutation(
      api.conversations.create,
      { title: "Voice session", mode: "voice" },
      { token },
    );
  }

  const model = getRealtimeModel(runtime?.defaultRealtimeModel);
  const voice = getDefaultVoice(runtime?.defaultVoice);

  const voiceSessionId = await fetchMutation(
    api.voiceSessions.create,
    { conversationId, provider: "ai-gateway", model, voice },
    { token },
  );

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

  track("voice_session_started", { model, userId: me._id, voice });

  return NextResponse.json({
    conversationId,
    voiceSessionId,
    model,
    voice,
    sessionConfig: { voice, turnDetection: { type: "server-vad" } },
    tools: clientSafeTools("user"),
  });
}

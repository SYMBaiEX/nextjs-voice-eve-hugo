import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getRealtimeModel, getDefaultVoice } from "@/lib/ai";
import { clientSafeTools } from "@/agent/hugo/tools/registry";
import { isVoiceLimitReached } from "@/lib/usage";
import { track } from "@/lib/telemetry";

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
  const me = await fetchQuery(api.users.currentUser, {}, { token });
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

  track("voice_session_started", { model, voice });

  return NextResponse.json({
    conversationId,
    voiceSessionId,
    model,
    voice,
    sessionConfig: { voice, turnDetection: { type: "server-vad" } },
    tools: clientSafeTools("user"),
  });
}

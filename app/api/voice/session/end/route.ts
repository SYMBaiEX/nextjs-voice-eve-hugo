import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchMutation, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { track } from "@/lib/telemetry";

/**
 * POST /api/voice/session/end (PRD 5.4, 5.9)
 *
 * Authenticated. Finalizes a voice session: stamps duration + counters, logs a
 * usage event with audio seconds + estimated cost, and records the lifecycle
 * event for observability. Transcript turns are persisted live during the
 * session; an optional summary may be attached here.
 */
const Body = z.object({
  voiceSessionId: z.string(),
  conversationId: z.string().optional(),
  status: z.enum(["ended", "failed"]).optional(),
  interruptionCount: z.number().int().min(0).optional(),
  turnCount: z.number().int().min(0).optional(),
  audioInputSeconds: z.number().min(0).optional(),
  audioOutputSeconds: z.number().min(0).optional(),
  summary: z.string().max(2000).optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

export async function POST(req: Request) {
  const token = await authToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const b = parsed.data;
  const voiceSessionId = b.voiceSessionId as Id<"voiceSessions">;
  const conversationId = b.conversationId as Id<"conversations"> | undefined;

  // voiceSessions.end meters audio usage from the server-measured duration, so
  // the route no longer logs a (client-supplied, bypassable) usage event here.
  await fetchMutation(
    api.voiceSessions.end,
    {
      voiceSessionId,
      status: b.status ?? "ended",
      interruptionCount: b.interruptionCount,
      turnCount: b.turnCount,
      errorCode: b.errorCode,
      errorMessage: b.errorMessage,
    },
    { token },
  );

  if (b.summary && conversationId) {
    await fetchMutation(
      api.conversations.setSummary,
      { conversationId, summary: b.summary },
      { token },
    ).catch(() => {});
  }

  await fetchMutation(
    api.agentEvents.log,
    {
      eventType: "voice_session_ended",
      status: b.status ?? "ended",
      voiceSessionId,
      conversationId,
    },
    { token },
  ).catch(() => {});

  track("voice_session_ended", {
    status: b.status ?? "ended",
    turns: b.turnCount ?? 0,
    interruptions: b.interruptionCount ?? 0,
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchMutation, fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { track } from "@/lib/telemetry";
import { routeErrorMessage, statusFromConvexError } from "@/lib/route-errors";

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

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
} as const;

export async function POST(req: Request) {
  const token = await authToken();
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const b = parsed.data;
  const voiceSessionId = b.voiceSessionId as Id<"voiceSessions">;
  let conversationId: Id<"conversations">;
  try {
    const session = await fetchQuery(
      api.voiceSessions.getOwn,
      { voiceSessionId },
      { token },
    );
    if (!session) {
      return NextResponse.json(
        { error: "Voice session not found." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    conversationId = session.conversationId;
  } catch (err) {
    const message = routeErrorMessage(err, "Failed to validate voice session.");
    track("voice_session_end_lookup_failed", {
      error: message,
      voiceSessionId,
    });
    return NextResponse.json(
      { error: "Could not validate voice session." },
      { status: statusFromConvexError(err), headers: NO_STORE_HEADERS },
    );
  }

  // voiceSessions.end meters audio usage from the server-measured duration, so
  // the route no longer logs a (client-supplied, bypassable) usage event here.
  try {
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
  } catch (err) {
    const message = routeErrorMessage(err, "Could not end voice session.");
    track("voice_session_end_failed", {
      error: message,
      voiceSessionId,
    });
    return NextResponse.json(
      { error: "Could not end voice session." },
      { status: statusFromConvexError(err), headers: NO_STORE_HEADERS },
    );
  }

  if (b.summary) {
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

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { track } from "@/lib/telemetry";

/**
 * POST /api/realtime/tool-error — best-effort telemetry sink for CLIENT-side
 * realtime session errors (PRD 5.9/5.17).
 *
 * `useHugoRealtime`'s `onError` only ever set client-only React state — a
 * genuine provider-side realtime error (e.g. after a tool call) was invisible
 * to server logs, which is exactly why a reported voice+searchWeb error
 * couldn't be pinned to an exact message. This gives the client a place to
 * report what it saw, logged via the same `track()` every other event uses,
 * so a recurrence is diagnosable from Vercel logs instead of a user's
 * description alone. No side effects beyond logging — never blocks the UI.
 */

const Body = z.object({
  message: z.string().min(1).max(2000),
  voiceSessionId: z.string().min(1),
  lastToolName: z.string().max(80).optional(),
});

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

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
      { error: "Invalid report." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const { message, voiceSessionId, lastToolName } = parsed.data;

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  // Ownership check only — this endpoint has no other side effects, so it
  // doesn't need the realtime tool-call grant cookie /api/realtime/tool uses.
  const session = await fetchQuery(
    api.voiceSessions.getOwn,
    { voiceSessionId: voiceSessionId as Id<"voiceSessions"> },
    { token },
  ).catch(() => null);
  if (!session) {
    return NextResponse.json(
      { error: "Voice session not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  track("realtime_client_error", {
    error: message,
    lastToolName: lastToolName ?? null,
    userId: me._id,
    voiceSessionId,
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

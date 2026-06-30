import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { fetchMutation, fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { track } from "@/lib/telemetry";
import { buildHugoTools } from "@/hugo-agent/tools";
import { rateLimit } from "@/lib/rate-limit";
import { REALTIME_TOOL_RATE } from "@/lib/constants";
import {
  decodeRealtimeToolGrantCookie,
  isRealtimeToolGrantValid,
  readRealtimeToolGrantMetadata,
  REALTIME_TOOL_GRANT_COOKIE,
} from "@/lib/realtime-grants";
import { routeErrorMessage, statusFromConvexError } from "@/lib/route-errors";

const Body = z.object({
  args: z.unknown().optional(),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  voiceSessionId: z.string().min(1),
});

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
} as const;

type SafeParseResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };

type ExecutableHugoTool = {
  execute: (
    input: unknown,
    options: {
      abortSignal?: AbortSignal;
      context: Record<string, never>;
      messages: [];
      toolCallId: string;
    },
  ) => unknown;
  inputSchema?: {
    safeParse?: (input: unknown) => SafeParseResult;
  };
};

function hasExecute(tool: unknown): tool is ExecutableHugoTool {
  return (
    typeof tool === "object" &&
    tool !== null &&
    "execute" in tool &&
    typeof (tool as { execute?: unknown }).execute === "function"
  );
}

function parseToolArgs(tool: ExecutableHugoTool, args: unknown): unknown {
  const parser = tool.inputSchema?.safeParse;
  if (!parser) return args ?? {};
  const result = parser(args ?? {});
  if (!result.success) {
    throw new Error("Invalid tool input.");
  }
  return result.data;
}

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
      { error: "Invalid realtime tool request." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { args, toolCallId, toolName, voiceSessionId } = parsed.data;
  let session;
  try {
    session = await fetchQuery(
      api.voiceSessions.getOwn,
      { voiceSessionId: voiceSessionId as Id<"voiceSessions"> },
      { token },
    );
  } catch (err) {
    const message = routeErrorMessage(err, "Failed to validate voice session.");
    track("realtime_tool_session_lookup_failed", {
      error: message,
      toolCallId,
      toolName,
      voiceSessionId,
    });
    return NextResponse.json(
      { error: "Could not validate voice session." },
      { status: statusFromConvexError(err), headers: NO_STORE_HEADERS },
    );
  }
  if (!session) {
    return NextResponse.json(
      { error: "Voice session not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  if (session.status !== "connecting" && session.status !== "active") {
    return NextResponse.json(
      { error: "Voice session is not active." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const grantCookie = decodeRealtimeToolGrantCookie(
    (await cookies()).get(REALTIME_TOOL_GRANT_COOKIE)?.value,
  );
  const grantMatchesSession = grantCookie?.voiceSessionId === voiceSessionId;
  const grantValid =
    grantMatchesSession &&
    isRealtimeToolGrantValid({
      grant: grantCookie.grant,
      metadata: readRealtimeToolGrantMetadata(session),
    });
  if (!grantValid) {
    track("realtime_tool_grant_rejected", {
      toolCallId,
      toolName,
      userId: me._id,
      voiceSessionId,
    });
    return NextResponse.json(
      { error: "Realtime tool grant is missing or expired." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const limit = rateLimit(
    `realtime-tool:${me._id}:${voiceSessionId}`,
    REALTIME_TOOL_RATE.max,
    REALTIME_TOOL_RATE.windowMs,
  );
  if (!limit.ok) {
    track("realtime_tool_rate_limited", {
      toolCallId,
      toolName,
      userId: me._id,
      voiceSessionId,
    });
    return NextResponse.json(
      { error: "Too many realtime tool calls. Slow down a moment." },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }

  const tools = buildHugoTools({
    conversationId: session.conversationId,
    role: me.role,
    token,
  });
  const tool = tools[toolName];
  if (!hasExecute(tool)) {
    track("realtime_tool_not_found", {
      toolCallId,
      toolName,
      userId: me._id,
      voiceSessionId,
    });
    return NextResponse.json(
      { error: "Tool not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const input = parseToolArgs(tool, args);
    const startedAt = Date.now();
    const output = await tool.execute(input, {
      abortSignal: req.signal,
      context: {},
      messages: [],
      toolCallId,
    });
    track("realtime_tool_completed", {
      latencyMs: Date.now() - startedAt,
      toolCallId,
      toolName,
      userId: me._id,
      voiceSessionId,
    });
    await fetchMutation(
      api.usageEvents.log,
      {
        type: "tool_call",
        conversationId: session.conversationId,
        voiceSessionId: voiceSessionId as Id<"voiceSessions">,
        provider: "ai-gateway",
        model: session.model,
        latencyMs: Date.now() - startedAt,
        estimatedCost: 0,
      },
      { token },
    ).catch(() => {});
    return NextResponse.json(output ?? null, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed.";
    track("realtime_tool_failed", {
      error: message,
      toolCallId,
      toolName,
      userId: me._id,
      voiceSessionId,
    });
    return NextResponse.json(
      { error: message },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}

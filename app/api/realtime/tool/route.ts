import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { track } from "@/lib/telemetry";
import { buildHugoTools } from "@/agent/hugo/tools";

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
  const session = await fetchQuery(
    api.voiceSessions.getOwn,
    { voiceSessionId: voiceSessionId as Id<"voiceSessions"> },
    { token },
  );
  if (!session) {
    return NextResponse.json(
      { error: "Voice session not found." },
      { status: 404, headers: NO_STORE_HEADERS },
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

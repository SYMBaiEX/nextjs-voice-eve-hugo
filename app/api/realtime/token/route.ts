import { NextResponse } from "next/server";
import {
  experimental_getRealtimeToolDefinitions,
  type Experimental_RealtimeToolDefinition,
} from "ai";
import { z } from "zod";
import { fetchQuery, fetchMutation, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getRealtimeModel } from "@/lib/ai";
import { getUserGateway } from "@/lib/user-gateway";
import { rateLimit } from "@/lib/rate-limit";
import {
  REALTIME_TOKEN_RATE,
  REALTIME_TOKEN_TTL_SECONDS,
  REALTIME_TOOL_GRANT_TTL_SECONDS,
} from "@/lib/constants";
import { track } from "@/lib/telemetry";
import { buildHugoTools } from "@/hugo-agent/tools";
import type { RealtimeSessionConfig } from "@/lib/types";
import {
  createRealtimeToolGrant,
  encodeRealtimeToolGrantCookie,
  realtimeToolGrantMetadata,
  REALTIME_TOOL_GRANT_COOKIE,
} from "@/lib/realtime-grants";

const Body = z.object({
  sessionConfig: z
    .object({
      inputAudioTranscription: z.object({}).optional(),
      instructions: z.string().min(1).max(16_000).optional(),
      voice: z.string().min(1).optional(),
      turnDetection: z.object({ type: z.literal("server-vad") }).optional(),
    })
    .optional(),
});

interface CachedRealtimeToken {
  expiresAtMs: number;
  token: string;
  url: string;
}

interface RealtimeTokenEnvelope {
  conversationId: string;
  expiresAt: number;
  model: string;
  sessionConfig: RealtimeSessionConfig;
  token: string;
  tools: Experimental_RealtimeToolDefinition[];
  url: string;
  voiceSessionId: string;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
} as const;

const MAX_CACHED_REALTIME_TOKENS = 500;
const realtimeTokenCache = new Map<string, CachedRealtimeToken>();

function tokenCacheKey(args: {
  model: string;
  sessionConfig: RealtimeSessionConfig | undefined;
  userId: string;
  voiceSessionId: string;
}): string {
  return JSON.stringify([
    args.userId,
    args.voiceSessionId,
    args.model,
    args.sessionConfig ?? null,
  ]);
}

function getCachedRealtimeToken(cacheKey: string): CachedRealtimeToken | null {
  const cached = realtimeTokenCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAtMs <= Date.now() + 5_000) {
    realtimeTokenCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function pruneRealtimeTokenCache() {
  const now = Date.now();
  for (const [key, cached] of realtimeTokenCache) {
    if (cached.expiresAtMs <= now + 5_000) {
      realtimeTokenCache.delete(key);
    }
  }
  for (const key of realtimeTokenCache.keys()) {
    if (realtimeTokenCache.size <= MAX_CACHED_REALTIME_TOKENS) break;
    realtimeTokenCache.delete(key);
  }
}

function voiceSessionLookupStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("unauthorized")) return 401;
  if (normalized.includes("forbidden")) return 403;
  return 500;
}

function realtimeResponse(
  payload: RealtimeTokenEnvelope,
): ReturnType<typeof NextResponse.json> {
  return NextResponse.json(payload, {
    headers: NO_STORE_HEADERS,
  });
}

async function mintRealtimeToolGrant(args: {
  token: string;
  voiceSessionId: Id<"voiceSessions">;
}): Promise<{ grant: string; expiresAtMs: number }> {
  const grant = createRealtimeToolGrant();
  // Independent of the 60s realtime token: the grant must outlive the token so
  // tool calls late in a voice session don't fail (see
  // REALTIME_TOOL_GRANT_TTL_SECONDS). Per-call rechecks (auth + ownership +
  // session still active) remain the real bound.
  const expiresAtMs = Date.now() + REALTIME_TOOL_GRANT_TTL_SECONDS * 1000;
  const metadata = realtimeToolGrantMetadata(grant, expiresAtMs);
  await fetchMutation(
    api.voiceSessions.setRealtimeToolGrant,
    {
      voiceSessionId: args.voiceSessionId,
      grantHash: metadata.hash,
      expiresAtMs: metadata.expiresAtMs,
      issuedAtMs: metadata.issuedAtMs,
    },
    { token: args.token },
  );
  return { grant, expiresAtMs };
}

function attachRealtimeToolGrantCookie(args: {
  grant: string;
  response: ReturnType<typeof NextResponse.json>;
  voiceSessionId: string;
  expiresAtMs: number;
}): ReturnType<typeof NextResponse.json> {
  args.response.cookies.set(
    REALTIME_TOOL_GRANT_COOKIE,
    encodeRealtimeToolGrantCookie({
      grant: args.grant,
      voiceSessionId: args.voiceSessionId,
    }),
    {
      expires: new Date(args.expiresAtMs),
      httpOnly: true,
      path: "/api/realtime",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    },
  );
  return args.response;
}

/**
 * POST /api/realtime/token (PRD 5.4, 5.11, 5.17)
 *
 * Authenticated, rate-limited. Mints a SHORT-LIVED AI Gateway realtime token
 * server-side and returns a client-safe realtime envelope. The AI_GATEWAY_API_KEY never
 * leaves the server. Attaches to the caller's existing voiceSession (passed as
 * ?session=ID) and flips it to "connecting". If voice is unavailable (no key,
 * gateway error) the client falls back to text chat.
 */
export async function POST(req: Request) {
  const token = await authToken();
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  // Resolve the caller's gateway (admin → server key; everyone else → BYOK).
  const { gw, configured } = await getUserGateway(me, token);

  const url = new URL(req.url);
  const sessionParam = url.searchParams.get("session") as
    | Id<"voiceSessions">
    | null;
  if (!sessionParam) {
    return NextResponse.json(
      { error: "A voice session is required before connecting." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let session: Doc<"voiceSessions"> | null;
  try {
    session = await fetchQuery(
      api.voiceSessions.getOwn,
      { voiceSessionId: sessionParam },
      { token },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to validate voice session.";
    track("realtime_voice_session_lookup_failed", {
      error: message,
      userId: me._id,
      voiceSessionId: sessionParam,
    });
    return NextResponse.json(
      { error: "Could not validate voice session." },
      { status: voiceSessionLookupStatus(message), headers: NO_STORE_HEADERS },
    );
  }

  if (!session) {
    track("realtime_voice_session_not_found", {
      userId: me._id,
      voiceSessionId: sessionParam,
    });
    return NextResponse.json(
      { error: "Voice session not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const requestedConfig = parsed.success ? parsed.data.sessionConfig : undefined;
  const sessionConfig: RealtimeSessionConfig = {
    ...(requestedConfig?.inputAudioTranscription
      ? { inputAudioTranscription: {} }
      : {}),
    ...(requestedConfig?.instructions
      ? { instructions: requestedConfig.instructions }
      : {}),
    voice: requestedConfig?.voice ?? session.voice,
    turnDetection: { type: "server-vad" as const },
  };

  // Mint for the same realtime model the voice session was created with, so
  // the token and the client codec agree without another settings read.
  const model = getRealtimeModel(session.model);
  const tools = await experimental_getRealtimeToolDefinitions({
    tools: buildHugoTools({
      conversationId: session.conversationId,
      role: me.role,
      token,
    }),
  });
  const cacheKey = tokenCacheKey({
    model,
    sessionConfig,
    userId: me._id,
    voiceSessionId: sessionParam,
  });
  const cached = getCachedRealtimeToken(cacheKey);
  if (cached) {
    let grantResult: { grant: string; expiresAtMs: number };
    try {
      grantResult = await mintRealtimeToolGrant({
        token,
        voiceSessionId: sessionParam,
      });
      await fetchMutation(
        api.voiceSessions.updateStatus,
        { voiceSessionId: sessionParam, status: "connecting" },
        { token },
      ).catch(() => {});
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to authorize realtime tools.";
      track("realtime_tool_grant_failed", {
        error: message,
        model,
        userId: me._id,
        voiceSessionId: sessionParam,
      });
      return NextResponse.json(
        { error: "Could not authorize realtime tools." },
        { status: voiceSessionLookupStatus(message), headers: NO_STORE_HEADERS },
      );
    }
    track("realtime_token_reused", {
      model,
      userId: me._id,
      voiceSessionId: sessionParam,
    });
    return attachRealtimeToolGrantCookie({
      expiresAtMs: grantResult.expiresAtMs,
      grant: grantResult.grant,
      response: realtimeResponse({
        conversationId: session.conversationId,
        expiresAt: Math.floor(cached.expiresAtMs / 1000),
        model,
        sessionConfig,
        token: cached.token,
        tools,
        url: cached.url,
        voiceSessionId: sessionParam,
      }),
      voiceSessionId: sessionParam,
    });
  }

  if (!configured) {
    // Voice unavailable without gateway auth — signal text fallback. Admin means
    // the server key is missing; everyone else needs to bring their own key.
    const forAdmin = me.role === "admin";
    await fetchMutation(
      api.voiceSessions.updateStatus,
      {
        voiceSessionId: sessionParam,
        status: "failed",
        errorCode: forAdmin ? "no_gateway_key" : "gateway_key_required",
        errorMessage: forAdmin
          ? "AI Gateway key not configured."
          : "Add your Vercel AI Gateway key in Settings to use voice.",
      },
      { token },
    ).catch(() => {});
    return NextResponse.json(
      {
        error: forAdmin
          ? "Realtime voice is not configured. Falling back to text chat."
          : "Add your Vercel AI Gateway key in Settings to use voice.",
        ...(forAdmin ? {} : { code: "gateway_key_required" }),
      },
      { status: forAdmin ? 503 : 402, headers: NO_STORE_HEADERS },
    );
  }

  // Per-user rate limit on fresh token minting.
  const limit = rateLimit(
    `realtime-token:${me._id}`,
    REALTIME_TOKEN_RATE.max,
    REALTIME_TOKEN_RATE.windowMs,
  );
  if (!limit.ok) {
    track("realtime_token_rate_limited", { userId: me._id });
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

  try {
    const startedAt = Date.now();
    const {
      expiresAt,
      token: realtimeToken,
      url: realtimeUrl,
    } =
      await gw.experimental_realtime.getToken({
        expiresAfterSeconds: REALTIME_TOKEN_TTL_SECONDS,
        model,
        sessionConfig,
      });

    const expiresAtMs =
      (expiresAt ?? Math.floor(Date.now() / 1000) + REALTIME_TOKEN_TTL_SECONDS) *
      1000;
    realtimeTokenCache.set(cacheKey, {
      expiresAtMs,
      token: realtimeToken,
      url: realtimeUrl,
    });
    pruneRealtimeTokenCache();

    const grantResult = await mintRealtimeToolGrant({
      token,
      voiceSessionId: sessionParam,
    });

    await fetchMutation(
      api.voiceSessions.updateStatus,
      { voiceSessionId: sessionParam, status: "connecting" },
      { token },
    ).catch(() => {});

    track("realtime_token_minted", {
      latencyMs: Date.now() - startedAt,
      model,
      userId: me._id,
      voiceSessionId: sessionParam,
    });

    return attachRealtimeToolGrantCookie({
      expiresAtMs: grantResult.expiresAtMs,
      grant: grantResult.grant,
      response: realtimeResponse({
        conversationId: session.conversationId,
        expiresAt: Math.floor(expiresAtMs / 1000),
        model,
        sessionConfig,
        token: realtimeToken,
        tools,
        url: realtimeUrl,
        voiceSessionId: sessionParam,
      }),
      voiceSessionId: sessionParam,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mint token";
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
    track("realtime_token_failed", {
      error: message,
      model,
      userId: me._id,
      voiceSessionId: sessionParam,
    });
    return NextResponse.json(
      { error: "Could not start realtime voice. Falling back to text chat." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}

import { NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { fetchQuery, fetchMutation, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildHugoGatewayProviderOptions,
  buildHugoSystemPrompt,
  buildHugoTools,
  getHugoTextCallSettings,
  getTextModel,
  isAiConfigured,
  resolveUserModel,
} from "@/lib/ai";
import { getUserGateway } from "@/lib/user-gateway";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { resolveTextModel } from "@/lib/model-catalog";
import { runEveTurn } from "@/lib/eve-bridge";
import { hugoTelemetry, track } from "@/lib/telemetry";
import { isTextLimitReached } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import { REALTIME_TOKEN_RATE } from "@/lib/constants";

export const maxDuration = 60;

/**
 * POST /api/agent/hugo (PRD 5.11)
 *
 * Authenticated, non-streaming Hugo invocation for structured/tool-driven tasks
 * (e.g. summarize a session, run a tool sequence). Shares Hugo's identity and
 * tool policy with chat + voice.
 */
const Body = z.object({
  prompt: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
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

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user rate limit — this is a paid LLM call (PRD 5.17).
  const limit = rateLimit(
    `agent-hugo:${me._id}`,
    REALTIME_TOKEN_RATE.max,
    REALTIME_TOKEN_RATE.windowMs,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  // Enforce the daily message limit + maintenance mode, like /api/chat.
  const usage = await fetchQuery(api.usageEvents.todayForUser, {}, { token });
  if (
    isTextLimitReached(
      { textMessages: usage.textMessages, voiceMinutes: usage.voiceMinutes },
      usage.limits,
    )
  ) {
    return NextResponse.json(
      { error: "Daily message limit reached. Come back tomorrow." },
      { status: 429 },
    );
  }
  const runtime = await getRuntimeConfig(token);
  if (runtime?.maintenanceMode && me.role !== "admin") {
    return NextResponse.json(
      { error: "Hugo is in maintenance mode. Please try again shortly." },
      { status: 503 },
    );
  }

  const conversationId = parsed.data.conversationId as
    | Id<"conversations">
    | undefined;

  // BYOK stays in-process below (their own key + model choice); everyone else
  // runs on Eve (see /api/chat's route for the full rationale).
  const usesEve = me.role === "admin" || !me.hasGatewayKey;
  if (usesEve) {
    if (!isAiConfigured()) {
      return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
    }
    const eveConversationId =
      conversationId ??
      (await fetchMutation(
        api.conversations.create,
        { title: "Agent invocation", mode: "text" },
        { token },
      ));
    const convo = conversationId
      ? await fetchQuery(
          api.conversations.get,
          { conversationId: eveConversationId },
          { token },
        ).catch(() => null)
      : null;

    const eveStartedAt = Date.now();
    try {
      const { text, usage: modelUsage } = await runEveTurn({
        originUrl: req.url,
        caller: {
          userId: me._id,
          role: me.role,
          token,
          conversationId: eveConversationId,
        },
        userText: parsed.data.prompt,
        priorEveSession: convo?.eveSessionState,
      });

      await fetchMutation(
        api.usageEvents.log,
        {
          type: "text_message",
          conversationId: eveConversationId,
          provider: "ai-gateway",
          model: getTextModel(),
          inputTokens: modelUsage.inputTokens,
          outputTokens: modelUsage.outputTokens,
          latencyMs: Date.now() - eveStartedAt,
        },
        { token },
      ).catch(() => {});

      track("agent_invoke_completed", {
        conversationId: eveConversationId,
        inputTokens: modelUsage.inputTokens ?? null,
        latencyMs: Date.now() - eveStartedAt,
        model: getTextModel(),
        outputTokens: modelUsage.outputTokens ?? null,
        userId: me._id,
      });
      return NextResponse.json({ text });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Agent invocation failed";
      track("agent_invoke_failed", {
        conversationId: eveConversationId,
        error: message,
        model: getTextModel(),
        userId: me._id,
      });
      return NextResponse.json(
        { error: "Hugo couldn't complete that request right now." },
        { status: 502 },
      );
    }
  }

  // BYOK path (a non-admin with their own key): resolve their gateway. A
  // stored-but-undecryptable key (e.g. KEY_ENCRYPTION_SECRET rotated) still
  // 402s here even though `usesEve` was false, rather than silently failing.
  const { gw, cacheKey, configured } = await getUserGateway(me, token);
  if (!configured) {
    return NextResponse.json(
      {
        error: "Add your Vercel AI Gateway key in Settings to use Hugo.",
        code: "gateway_key_required",
      },
      { status: 402 },
    );
  }

  const startedAt = Date.now();
  const model = await resolveTextModel(
    resolveUserModel(me, runtime, "text"),
    gw,
    cacheKey,
    configured,
  );
  const callSettings = getHugoTextCallSettings("agent");

  try {
    const { text, usage: modelUsage } = await generateText({
      model: gw.languageModel(model),
      system: buildHugoSystemPrompt({
        mode: "text",
        userName: me.name,
        role: me.role,
      }),
      prompt: parsed.data.prompt,
      tools: buildHugoTools({ token, conversationId, role: me.role }),
      // 10, not 5 — see app/api/chat/route.ts's stopWhen for why.
      stopWhen: stepCountIs(10),
      maxOutputTokens: callSettings.maxOutputTokens,
      maxRetries: callSettings.maxRetries,
      timeout: callSettings.timeoutMs,
      providerOptions: buildHugoGatewayProviderOptions({
        feature: "agent",
        mode: "text",
        userId: me._id,
        conversationId,
      }),
      experimental_telemetry: hugoTelemetry("hugo.agent", {
        ...(conversationId ? { conversationId } : {}),
        userId: me._id,
      }),
    });

    // Log usage so the call counts toward the daily cap and appears in cost rollups.
    await fetchMutation(
      api.usageEvents.log,
      {
        type: "text_message",
        conversationId,
        provider: "ai-gateway",
        model,
        inputTokens: modelUsage?.inputTokens,
        outputTokens: modelUsage?.outputTokens,
        latencyMs: Date.now() - startedAt,
      },
      { token },
    ).catch(() => {});

    track("agent_invoke_completed", {
      conversationId,
      inputTokens: modelUsage?.inputTokens ?? null,
      latencyMs: Date.now() - startedAt,
      model,
      outputTokens: modelUsage?.outputTokens ?? null,
      userId: me._id,
    });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent invocation failed";
    track("agent_invoke_failed", {
      conversationId,
      error: message,
      model,
      userId: me._id,
    });
    return NextResponse.json(
      { error: "Hugo couldn't complete that request right now." },
      { status: 502 },
    );
  }
}

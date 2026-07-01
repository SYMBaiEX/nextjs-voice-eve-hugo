import "server-only";
import { Client, type SessionState } from "eve/client";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { fetchMutation } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Role } from "@/lib/types";

/**
 * Server-to-server bridge into the Eve durable runtime for Hugo's
 * keyless/admin text path (PRD: Eve crossover).
 *
 * The browser never talks to Eve directly — `app/api/chat` and
 * `app/api/agent/hugo` call in from the server, after running the app's full
 * policy (auth, rate limit, daily usage cap, maintenance mode, conversation
 * resolve). `agent/channels/eve.ts`'s route auth only admits this trusted
 * server; its `onMessage` derives the session's real per-user identity from
 * the `x-hugo-*` headers set here.
 *
 * The route auth itself (`vercelOidc()`/`localDev()` in `agent/channels/eve.ts`)
 * needs the client to actually present a credential — `localDev()` only grants
 * access when the request's URL is loopback (`localhost`/`127.*`), which is
 * true in local dev but never true on a real Vercel deployment. So this client
 * always offers the deployment's own `VERCEL_OIDC_TOKEN` (the same
 * auto-provided token `lib/ai.ts`'s `isAiConfigured()` already relies on for
 * the AI Gateway) as a `vercelOidc` bearer credential; `Client` no-ops this
 * when the token is empty (local dev without it), so `localDev()`'s loopback
 * check keeps working exactly as before there.
 */

export interface EveBridgeCaller {
  userId: string;
  role?: Role;
  token: string;
  conversationId: Id<"conversations">;
}

export interface EveTurnUsage {
  inputTokens?: number;
  outputTokens?: number;
}

function eveClient(originUrl: string, caller: EveBridgeCaller): Client {
  return new Client({
    host: new URL(originUrl).origin,
    // Empty/missing token resolves to "" here, which `Client` treats as "send
    // no Authorization header" — a safe no-op in local dev without one.
    auth: { vercelOidc: { token: () => process.env.VERCEL_OIDC_TOKEN ?? "" } },
    headers: {
      "x-hugo-token": caller.token,
      "x-hugo-user-id": caller.userId,
      "x-hugo-conversation-id": caller.conversationId,
      ...(caller.role ? { "x-hugo-role": caller.role } : {}),
    },
  });
}

/** Persist the durable Eve session cursor so the next turn resumes the same
 *  conversation instead of starting fresh. Best-effort — a failure here just
 *  means the next turn starts a new Eve session, not a data-loss risk. */
async function persistSessionState(
  caller: EveBridgeCaller,
  state: SessionState,
): Promise<void> {
  await fetchMutation(
    api.conversations.setEveSession,
    { conversationId: caller.conversationId, eveSessionState: state },
    { token: caller.token },
  ).catch(() => {});
}

function usageFromEvents(
  events: readonly { type: string; data?: unknown }[],
): EveTurnUsage {
  for (const event of events) {
    if (event.type === "step.completed") {
      const usage = (event.data as { usage?: EveTurnUsage } | undefined)?.usage;
      if (usage) return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    }
  }
  return {};
}

/**
 * Stream one turn of the keyless/admin text path through Eve, as an
 * AI-SDK-compatible UI message stream `Response` — consumed identically to
 * `streamText(...).toUIMessageStreamResponse()` by the existing `useChat`
 * client, so no client changes are needed. Persists the Eve session cursor
 * and reports the final text + token usage via `onFinish`, mirroring
 * `streamText`'s `onFinish` callback for the BYOK path.
 */
export function streamEveChat(args: {
  originUrl: string;
  caller: EveBridgeCaller;
  userText: string;
  priorEveSession?: SessionState;
  headers?: Record<string, string>;
  onFinish: (result: { text: string; usage: EveTurnUsage }) => Promise<void> | void;
  onError: (message: string) => Promise<void> | void;
}): Response {
  const { originUrl, caller, userText, priorEveSession, headers, onFinish, onError } =
    args;
  const client = eveClient(originUrl, caller);
  const session = client.session(priorEveSession);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let textId: string | null = null;
      let finalText = "";
      const seenEvents: { type: string; data?: unknown }[] = [];

      try {
        const response = await session.send(userText);
        for await (const event of response) {
          seenEvents.push(event as { type: string; data?: unknown });
          if (event.type === "message.appended") {
            if (!textId) {
              textId = crypto.randomUUID();
              writer.write({ type: "text-start", id: textId });
            }
            writer.write({
              type: "text-delta",
              id: textId,
              delta: event.data.messageDelta,
            });
          } else if (event.type === "message.completed" && event.data.message) {
            finalText = event.data.message;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Eve turn failed.";
        if (textId) writer.write({ type: "text-end", id: textId });
        writer.write({ type: "error", errorText: message });
        await onError(message);
        return;
      }

      if (textId) writer.write({ type: "text-end", id: textId });

      await persistSessionState(caller, session.state);
      await onFinish({ text: finalText, usage: usageFromEvents(seenEvents) });
    },
  });

  return createUIMessageStreamResponse({ stream, headers });
}

/**
 * Non-streaming variant for `/api/agent/hugo`'s structured invocation — waits
 * for the turn to finish and returns the assistant text + usage directly.
 */
export async function runEveTurn(args: {
  originUrl: string;
  caller: EveBridgeCaller;
  userText: string;
  priorEveSession?: SessionState;
}): Promise<{ text: string; usage: EveTurnUsage }> {
  const { originUrl, caller, userText, priorEveSession } = args;
  const client = eveClient(originUrl, caller);
  const session = client.session(priorEveSession);
  const response = await session.send(userText);
  const result = await response.result();

  await persistSessionState(caller, session.state);

  return {
    text: result.message ?? "",
    usage: usageFromEvents(result.events),
  };
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  MessageSquare,
  Mic,
  PhoneOff,
  RotateCcw,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  useHugoRealtime,
  type HugoRealtimeSession,
} from "@/hooks/useHugoRealtime";
import { useWakeWord } from "@/hooks/useWakeWord";
import { OrbSlot } from "@/components/hugo/OrbSlot";
import {
  HugoTranscript,
  type TranscriptMessage,
} from "@/components/hugo/HugoTranscript";
import { SuggestionChips } from "@/components/chat/Greeting";
import { ModelMenu } from "@/components/hugo/ModelMenu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/misc";
import { useAuthTransition } from "@/components/providers/ConvexClientProvider";
import { OPEN_GATEWAY_KEY_EVENT } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * HugoSurface — the unified voice + text console (PRD 5.5, 5.4).
 *
 * One transcript, one composer. Type to chat (`useChat` → /api/chat) or tap the
 * mic / the orb to start a live voice session (`useHugoRealtime`). The shared
 * app-layer orb shrinks to a small corner presence while typing and springs to a
 * centered hero while voice is live, with the transcript fading up behind it.
 *
 * Display is a single stream: the chat message list (seeded from history) with
 * finalized voice turns injected in, plus a thin overlay for the in-flight voice
 * turn. Voice turns also persist to Convex so they survive reloads.
 */

interface VoiceSessionStartResponse {
  voiceSessionId: string;
  conversationId: string;
  model: string;
  sessionConfig: { instructions: string; voice: string };
  voice: string;
}

interface RealtimeTurnLike {
  id?: string;
  role?: string;
  parts?: readonly { type: string; text?: string; state?: string }[];
  content?: string;
}

function turnText(message: RealtimeTurnLike): string {
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
  }
  return (message.content ?? "").trim();
}

function isFinalized(message: RealtimeTurnLike): boolean {
  if (!Array.isArray(message.parts)) return !!(message.content ?? "").trim();
  const textParts = message.parts.filter(
    (p) => p.type === "text" && typeof p.text === "string" && p.text.length > 0,
  );
  if (textParts.length === 0) return false;
  return textParts.every((p) => p.state !== "streaming");
}

/** End a voice session server-side; sendBeacon on unload, keepalive otherwise. */
function endVoiceSessionRequest(
  active: { voiceSessionId: string; conversationId: string },
  opts?: { beacon?: boolean },
): void {
  const body = JSON.stringify({
    voiceSessionId: active.voiceSessionId,
    conversationId: active.conversationId,
    status: "ended",
  });
  if (opts?.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/voice/session/end",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }
  void fetch("/api/voice/session/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body,
  }).catch(() => {});
}

// ─── Outer loader: seed the transcript from stored history before mounting ───

export function HugoSurface({
  conversationId,
  onConversationId,
  className,
}: {
  conversationId?: string;
  onConversationId?: (conversationId: string) => void;
  className?: string;
}) {
  const history = useQuery(
    api.messages.list,
    conversationId
      ? { conversationId: conversationId as Id<"conversations">, limit: 100 }
      : "skip",
  );

  const initialMessages = useMemo<UIMessage[]>(() => {
    if (!history) return [];
    return history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m._id as string,
        role: m.role as "user" | "assistant",
        parts: [
          { type: "text" as const, text: m.content || m.transcript || "" },
        ],
      }))
      .filter((m) => m.parts[0].text.length > 0) as UIMessage[];
  }, [history]);

  // Wait for history before mounting (useChat seeds messages once, at mount).
  if (conversationId && history === undefined) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <Spinner />
      </div>
    );
  }

  return (
    <HugoSurfaceInner
      // Remount (reset useChat + voice) on an explicit conversation switch.
      key={conversationId ?? "new"}
      conversationId={conversationId}
      initialMessages={initialMessages}
      onConversationId={onConversationId}
      className={className}
    />
  );
}

// ─── Inner surface: composer + transcript + dual orb slots ───

function HugoSurfaceInner({
  conversationId,
  initialMessages,
  onConversationId,
  className,
}: {
  conversationId?: string;
  initialMessages: UIMessage[];
  onConversationId?: (conversationId: string) => void;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >(conversationId);

  // BYOK soft-gate: non-admins without their own AI Gateway key can't reach the
  // model. Nudge them to add one (opens the dialog hosted by GatewayKeyBanner)
  // instead of firing a request that the server would reject with 402.
  const { canRunProtectedQueries } = useAuthTransition();
  const me = useQuery(
    api.users.currentUser,
    canRunProtectedQueries ? {} : "skip",
  );
  const keyless = !!me && me.role !== "admin" && !me.hasGatewayKey;
  const nudgeForKey = useCallback(() => {
    toast.error("Add your AI Gateway key to use Hugo.", {
      action: {
        label: "Add key",
        onClick: () =>
          window.dispatchEvent(new CustomEvent(OPEN_GATEWAY_KEY_EVENT)),
      },
    });
  }, []);

  // Recent tool calls for this user — drives the `tool_running` orb state and
  // status-line label in BOTH text and voice mode (voice's own hook has no
  // visibility into server-side tool execution beyond the one call it made).
  const recentToolCalls = useQuery(
    api.toolCalls.listOwn,
    canRunProtectedQueries ? { limit: 5 } : "skip",
  );
  const runningToolName = useMemo(() => {
    const running = recentToolCalls?.find(
      (c) =>
        c.completedAt == null &&
        (!activeConversationId || c.conversationId === activeConversationId),
    );
    return running?.toolName ?? null;
  }, [recentToolCalls, activeConversationId]);

  // Full tool-call history for THIS conversation → collapsible pills under the
  // assistant turn that ran them. The Convex ledger is the one source uniform
  // across voice/BYOK/Eve; `messages.list` supplies the assistant turns'
  // authoritative timestamps so calls can be associated to the right turn.
  const conversationToolCalls = useQuery(
    api.toolCalls.listForConversation,
    canRunProtectedQueries && activeConversationId
      ? { conversationId: activeConversationId as Id<"conversations"> }
      : "skip",
  );
  const conversationMessages = useQuery(
    api.messages.list,
    canRunProtectedQueries && activeConversationId
      ? { conversationId: activeConversationId as Id<"conversations">, limit: 100 }
      : "skip",
  );

  // Most recent active conversation — offers a "Continue with Hugo" affordance
  // on a fresh landing instead of starting from zero every time.
  const recentConversations = useQuery(
    api.conversations.list,
    canRunProtectedQueries && !activeConversationId
      ? { status: "active", limit: 1 }
      : "skip",
  );
  const continueConversation = activeConversationId
    ? undefined
    : recentConversations?.[0];

  // ── Voice session lifecycle (lifted from HugoVoicePanel) ──
  const [session, setSession] = useState<HugoRealtimeSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const appendVoiceTurn = useMutation(api.messages.appendVoiceTurn);
  const persistedIds = useRef<Set<string>>(new Set());
  const rt = useHugoRealtime(session);

  const messagesRef = useRef(rt.messages);
  useEffect(() => {
    messagesRef.current = rt.messages;
  }, [rt.messages]);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const adoptConversationId = useCallback(
    (id: string) => {
      setActiveConversationId((prev) => prev ?? id);
      onConversationId?.(id);
    },
    [onConversationId],
  );

  // ── Text chat ──
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const res = await fetch(input, init);
          const id = res.headers.get("x-conversation-id");
          if (id) setActiveConversationId((prev) => prev ?? id);
          return res;
        },
      }),
    [],
  );
  const { messages, sendMessage, status, stop, setMessages, regenerate } =
    useChat({
      transport,
      messages: initialMessages,
      // Throttle UI updates so smoothed token deltas render calmly, not jankily.
      experimental_throttle: 50,
      onError: (err: Error) => {
        toast.error(err.message || "Hugo couldn’t respond. Please try again.");
      },
    });
  const isStreaming = status === "submitted" || status === "streaming";

  // Report the (possibly server-created) conversation id up.
  useEffect(() => {
    if (activeConversationId) onConversationId?.(activeConversationId);
  }, [activeConversationId, onConversationId]);

  // ── Persist finalized voice turns to Convex (durability across reloads) ──
  const flushTurns = useCallback(
    (active: HugoRealtimeSession) => {
      for (const raw of messagesRef.current as RealtimeTurnLike[]) {
        const id = raw.id;
        const role = raw.role;
        if (!id || persistedIds.current.has(id)) continue;
        if (role !== "user" && role !== "assistant") continue;
        if (!isFinalized(raw)) continue;
        const text = turnText(raw);
        if (!text) continue;
        persistedIds.current.add(id);
        void appendVoiceTurn({
          voiceSessionId: active.voiceSessionId as Id<"voiceSessions">,
          sourceId: id,
          role,
          content: text,
        }).catch(() => persistedIds.current.delete(id));
      }
    },
    [appendVoiceTurn],
  );
  useEffect(() => {
    if (session) flushTurns(session);
  }, [rt.messages, session, flushTurns]);

  // ── Inject finalized voice turns into the single transcript ──
  const injectedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const toAdd: UIMessage[] = [];
    for (const m of rt.messages as RealtimeTurnLike[]) {
      if (!m.id || injectedIds.current.has(m.id)) continue;
      if (m.role !== "user" && m.role !== "assistant") continue;
      if (!isFinalized(m)) continue;
      const text = turnText(m);
      if (!text) continue;
      injectedIds.current.add(m.id);
      toAdd.push({
        id: `voice-${m.id}`,
        role: m.role,
        parts: [{ type: "text", text }],
      } as UIMessage);
    }
    if (toAdd.length) setMessages((prev) => [...prev, ...toAdd]);
  }, [rt.messages, setMessages]);

  // Live (not-yet-finalized) voice turn(s), shown until they finalize + inject.
  // Derived from the reactive `messages` (injected turns carry a `voice-<id>`
  // id) rather than the ref, so we never read a ref during render.
  const injectedKeys = useMemo(
    () => new Set((messages as { id?: string }[]).map((m) => m.id)),
    [messages],
  );
  const liveVoiceOverlay = useMemo<TranscriptMessage[]>(
    () =>
      (rt.messages as RealtimeTurnLike[])
        .filter((m) => m.id && !injectedKeys.has(`voice-${m.id}`))
        .map((m) => ({
          id: `live-${m.id}`,
          role: (m.role ?? "assistant") as TranscriptMessage["role"],
          content: turnText(m),
        }))
        .filter((m) => m.content.length > 0 || m.role === "assistant"),
    [rt.messages, injectedKeys],
  );

  const transcript = useMemo<TranscriptMessage[]>(
    () => [...(messages as TranscriptMessage[]), ...liveVoiceOverlay],
    [messages, liveVoiceOverlay],
  );

  // Bucket each ledger tool-call under the assistant turn it belongs to. With
  // no message↔toolCall foreign key we associate by time: a call attaches to
  // the first persisted assistant message whose createdAt is at/after the
  // call's startedAt (the answer produced once the tool returned). Calls newer
  // than every persisted assistant message — the in-flight turn — attach to
  // the last assistant turn on screen. Keyed by transcript turn id.
  const toolCallsByTurnId = useMemo(() => {
    const map = new Map<string, Doc<"toolCalls">[]>();
    if (!conversationToolCalls?.length) return map;

    const assistantTurnIds = transcript
      .filter((m) => m.role === "assistant")
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string");
    if (assistantTurnIds.length === 0) return map;
    const lastTurnId = assistantTurnIds[assistantTurnIds.length - 1];
    const onScreen = new Set(assistantTurnIds);

    const assistantRows = (conversationMessages ?? [])
      .filter((m) => m.role === "assistant")
      .map((m) => ({ id: m._id as string, createdAt: m.createdAt }))
      .sort((a, b) => a.createdAt - b.createdAt);

    const push = (turnId: string, call: Doc<"toolCalls">) => {
      const arr = map.get(turnId);
      if (arr) arr.push(call);
      else map.set(turnId, [call]);
    };

    for (const call of conversationToolCalls) {
      const match = assistantRows.find((r) => r.createdAt >= call.startedAt);
      if (match && onScreen.has(match.id)) push(match.id, call);
      else push(lastTurnId, call);
    }
    return map;
  }, [conversationToolCalls, conversationMessages, transcript]);

  // ── Voice start / connect / end (lifted from HugoVoicePanel) ──
  const startVoice = useCallback(async () => {
    if (isStarting || session) return;
    if (keyless) {
      nudgeForKey();
      return;
    }
    setIsStarting(true);
    try {
      const res = await fetch("/api/voice/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConversationId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Couldn’t start a voice session.");
      }
      const data = (await res.json()) as VoiceSessionStartResponse;
      persistedIds.current = new Set();
      setSession({
        voiceSessionId: data.voiceSessionId,
        conversationId: data.conversationId,
        instructions: data.sessionConfig.instructions,
        model: data.model,
        voice: data.voice,
      });
      adoptConversationId(data.conversationId);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Couldn’t start a voice session.",
      );
      setSession(null);
    } finally {
      setIsStarting(false);
    }
  }, [
    activeConversationId,
    adoptConversationId,
    isStarting,
    keyless,
    nudgeForKey,
    session,
  ]);

  const connect = useCallback(async () => {
    try {
      await rt.connect();
      await rt.toggleMic();
    } catch {
      toast.error("Couldn’t connect to Hugo.");
    }
  }, [rt]);

  const connectedFor = useRef<string | null>(null);
  useEffect(() => {
    if (session && connectedFor.current !== session.voiceSessionId) {
      connectedFor.current = session.voiceSessionId;
      void connect();
    }
  }, [session, connect]);

  const endVoice = useCallback(async () => {
    const active = session;
    if (active) flushTurns(active);
    rt.disconnect();
    setSession(null);
    connectedFor.current = null;
    if (active) endVoiceSessionRequest(active);
  }, [rt, session, flushTurns]);

  // Reliable teardown on tab close / navigate / unmount (idempotent server end).
  useEffect(() => {
    const endOnUnload = () => {
      const active = sessionRef.current;
      if (!active) return;
      flushTurns(active);
      endVoiceSessionRequest(active, { beacon: true });
    };
    window.addEventListener("pagehide", endOnUnload);
    return () => {
      window.removeEventListener("pagehide", endOnUnload);
      const active = sessionRef.current;
      if (active) {
        flushTurns(active);
        endVoiceSessionRequest(active);
      }
      rt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface realtime errors and tear the voice session down so it can't get
  // stuck "live" with no audio (e.g. the user denied the mic permission).
  const reportedError = useRef<string | null>(null);
  useEffect(() => {
    if (rt.error && rt.error !== reportedError.current) {
      reportedError.current = rt.error;
      toast.error(rt.error);
      if (sessionRef.current) void endVoice();
    }
  }, [rt.error, endVoice]);

  // ── Composer actions ──
  // Text has no BYOK gate: a keyless (or admin) user's turn runs on Eve, the
  // real agent, with the platform's own model — only voice still needs BYOK
  // (Eve has no realtime path, so voice must go through the user's own key).
  const submitText = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    void sendMessage({ text }, { body: { conversationId: activeConversationId } });
    textareaRef.current?.focus();
  }, [input, isStreaming, sendMessage, activeConversationId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitText();
      }
    },
    [submitText],
  );

  const voiceActive = !!session;

  // "Hey Hugo" wake word — opt-in (Settings), never runs while a real voice
  // session is already active (must not fight over the mic), and always
  // paired with the visible `listening` indicator rendered near the mic
  // button below.
  const wakeWordWanted = !!me?.preferences?.wakeWordEnabled && !voiceActive;
  const startVoiceRef = useRef(startVoice);
  useEffect(() => {
    startVoiceRef.current = startVoice;
  }, [startVoice]);
  const wakeWord = useWakeWord({
    enabled: wakeWordWanted,
    onWake: useCallback(() => void startVoiceRef.current(), []),
  });

  const baseOrbState = voiceActive ? rt.orbState : "idle";
  // A tool call in flight takes over the orb visually — except while Hugo is
  // actually speaking or in an error state, which stay visible as-is.
  const orbState = isStarting
    ? "connecting"
    : runningToolName && baseOrbState !== "speaking" && baseOrbState !== "error"
      ? "tool_running"
      : baseOrbState;
  const canInterrupt =
    rt.status === "connected" &&
    (rt.orbState === "speaking" || rt.orbState === "thinking");
  const isEmpty = transcript.length === 0 && !voiceActive;

  // Offer a regenerate when idle and Hugo's text reply was the last turn.
  const lastRole = (messages[messages.length - 1] as { role?: string } | undefined)
    ?.role;
  const canRegenerate =
    !isStreaming && !voiceActive && lastRole === "assistant";
  const handleRegenerate = useCallback(() => {
    void regenerate();
  }, [regenerate]);

  return (
    <div className={cn("relative flex h-full flex-col", className)}>
      {/* Hero orb — centered in the top half while voice is live OR on a fresh
          conversation (click it to start voice). Shrinks to a corner otherwise. */}
      {(voiceActive || isEmpty) && (
        <div
          className={cn(
            "absolute inset-x-0 z-10 flex justify-center",
            voiceActive ? "pointer-events-none top-4" : "top-[13%]",
          )}
          title={isEmpty ? "Talk to Hugo" : undefined}
        >
          <OrbSlot
            presence="hero"
            state={orbState}
            size={voiceActive ? 260 : 380}
            audioLevel={rt.audioLevel}
            onClick={isEmpty ? () => void startVoice() : undefined}
          />
        </div>
      )}

      {/* Transcript / greeting */}
      <div className="relative min-h-0 flex-1">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center px-4 pb-3 text-center">
            {/* Orb floats in the upper half (rendered absolutely); push the
                greeting down toward the composer. Suggestions live in the
                composer toolbar, beside the model selector. */}
            <div className="flex-1" aria-hidden />
            <div className="animate-rise">
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                What can I help with?
              </h1>
              <p className="mt-1.5 text-sm text-text-muted">
                Ask a question, talk it through, or pick one to start.
              </p>
              {continueConversation && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/chat?c=${continueConversation._id}`)
                  }
                  className="mt-4 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3.5 py-1.5 text-xs text-text-secondary transition-colors hover:border-hugo-cyan/40 hover:text-text-primary"
                >
                  <MessageSquare aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">
                    Continue with Hugo — {continueConversation.title}
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : voiceActive ? (
          // Voice: turns hug the composer and fade up behind the hero orb,
          // rather than stacking over it. The transcript owns its own scroll
          // (bottom-anchored); the mask dissolves the top behind the orb.
          <div
            className="h-full px-4"
            style={{
              // Pixel-based so the fade tracks the fixed-size hero orb + its
              // rings (~480px tall at the top) regardless of viewport height:
              // content behind the orb is invisible and fades in below it.
              maskImage:
                "linear-gradient(to bottom, transparent 0, transparent 150px, black 480px)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0, transparent 150px, black 480px)",
            }}
          >
            <div className="mx-auto h-full max-w-3xl">
              <HugoTranscript
                messages={transcript}
                fill
                anchor="bottom"
                toolCallsByTurnId={toolCallsByTurnId}
                className="pt-[19rem] pb-2"
              />
            </div>
          </div>
        ) : (
          <div
            className="scroll-thin h-full overflow-y-auto px-4"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0, black 14%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0, black 14%)",
            }}
          >
            <div className="mx-auto max-w-3xl pb-4 pt-10">
              <HugoTranscript
                messages={transcript}
                fill
                toolCallsByTurnId={toolCallsByTurnId}
              />
            </div>
          </div>
        )}

        {/* Corner orb — small ambient presence in an active text conversation;
            click to start voice. (Hidden on the empty state, where the orb is
            the centered hero.) */}
        {!voiceActive && !isEmpty && (
          <div
            className="absolute right-4 top-2 z-10 cursor-pointer"
            title="Talk to Hugo"
          >
            <OrbSlot
              state={orbState}
              size={52}
              audioLevel={rt.audioLevel}
              onClick={() => void startVoice()}
            />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto w-full max-w-3xl">
          {/* Live voice status bar */}
          {voiceActive && (
            <div className="mb-2 flex items-center justify-center gap-2">
              <Badge variant={orbState === "speaking" ? "cyan" : "blue"}>
                {isStarting ? "Connecting…" : statusLabel(orbState, runningToolName)}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => rt.interrupt()}
                disabled={!canInterrupt}
                aria-label="Interrupt Hugo"
              >
                <X aria-hidden /> Interrupt
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void endVoice()}
                aria-label="End voice session"
              >
                <PhoneOff aria-hidden /> End voice
              </Button>
            </div>
          )}

          {/* Model selector (card tab attached to the input's top-left) + the
              starter suggestions to its right on a fresh conversation. */}
          <div className="flex items-end gap-1.5 pl-3 pr-1">
            <ModelMenu />
            {isEmpty && (
              <SuggestionChips
                className="min-w-0 flex-1 pb-0.5"
                onPick={(t) => {
                  setInput(t);
                  textareaRef.current?.focus();
                }}
              />
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText();
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-surface-elevated/50 p-2 backdrop-blur-sm focus-within:border-hugo-cyan/40"
          >
            {/* Mic toggle */}
            <div className="relative shrink-0">
              <Button
                type="button"
                variant={voiceActive ? "primary" : "subtle"}
                size="icon"
                onClick={() => (voiceActive ? void endVoice() : void startVoice())}
                aria-pressed={voiceActive}
                aria-label={voiceActive ? "End voice session" : "Start voice"}
                className="rounded-full"
              >
                <Mic aria-hidden />
              </Button>
              {wakeWord.listening && (
                <span
                  role="status"
                  title="Listening for “Hey Hugo”"
                  aria-label="Listening for “Hey Hugo”"
                  className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center"
                >
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-hugo-cyan/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-hugo-cyan" />
                </span>
              )}
            </div>

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={voiceActive ? "Speak, or type…" : "Ask anything…"}
              aria-label="Message Hugo"
              rows={1}
              className="min-h-10 max-h-40 flex-1 border-0 bg-transparent px-1.5 py-2 focus-visible:ring-0"
            />

            {isStreaming ? (
              <Button
                type="button"
                variant="subtle"
                size="icon"
                onClick={() => stop()}
                aria-label="Stop generating"
                className="shrink-0 rounded-full"
              >
                <Square aria-hidden />
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="icon"
                disabled={!input.trim()}
                aria-label="Send message"
                className="shrink-0 rounded-full"
              >
                <SendHorizontal aria-hidden />
              </Button>
            )}
          </form>

          <div
            className="mt-1.5 flex h-6 items-center gap-2 px-2"
            aria-live="polite"
          >
            {isStreaming ? (
              <>
                <Spinner />
                <span className="text-xs font-mono text-text-muted">
                  {runningToolName
                    ? `${toolTickerLabel(runningToolName)}…`
                    : status === "submitted"
                      ? "Hugo is thinking…"
                      : "Hugo is responding…"}
                </span>
              </>
            ) : (
              canRegenerate && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-1.5 rounded-md text-xs text-text-muted transition-colors outline-none hover:text-text-primary focus-visible:text-text-primary"
                  aria-label="Regenerate Hugo's last response"
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Regenerate
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Friendly present-participle label for a running tool, for the status line /
 *  voice badge — falls back to a generic camelCase→words split for any tool
 *  not explicitly listed here (new tools stay covered without a code change,
 *  just less polished wording until added). */
const TOOL_TICKER_LABELS: Record<string, string> = {
  getCurrentUserProfile: "Checking your profile",
  getCurrentUsageSummary: "Checking usage",
  listUserMemories: "Checking memory",
  getConversationTranscript: "Reading the conversation",
  updateUserPreferences: "Updating preferences",
  getRecentConversationContext: "Checking recent conversations",
  saveUserPreference: "Saving a preference",
  createConversationSummary: "Summarizing",
  searchUserConversations: "Searching conversations",
  getWeather: "Checking the weather",
  searchWeb: "Searching the web",
  getSystemUsageSummary: "Checking system usage",
  getUserUsageSummary: "Checking usage",
  getVoiceSessionDiagnostics: "Checking voice diagnostics",
  createTask: "Creating a task",
  listTasks: "Checking your tasks",
  completeTask: "Completing a task",
  deleteTask: "Removing a task",
  draftEmail: "Drafting an email",
};

function toolTickerLabel(toolName: string): string {
  return (
    TOOL_TICKER_LABELS[toolName] ??
    `Running ${toolName.replace(/([A-Z])/g, " $1").toLowerCase().trim()}`
  );
}

function statusLabel(state: string, runningToolName?: string | null): string {
  switch (state) {
    case "listening":
      return "Listening";
    case "speaking":
      return "Speaking";
    case "thinking":
      return "Thinking";
    case "connecting":
      return "Connecting…";
    case "tool_running":
      return runningToolName ? toolTickerLabel(runningToolName) : "Running tool";
    default:
      return "Voice live";
  }
}

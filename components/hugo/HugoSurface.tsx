"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Mic, PhoneOff, SendHorizontal, Square, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useHugoRealtime,
  type HugoRealtimeSession,
} from "@/hooks/useHugoRealtime";
import { OrbSlot } from "@/components/hugo/OrbSlot";
import {
  HugoTranscript,
  type TranscriptMessage,
} from "@/components/hugo/HugoTranscript";
import { Greeting } from "@/components/chat/Greeting";
import { ModelMenu } from "@/components/hugo/ModelMenu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/misc";
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
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >(conversationId);

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
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport,
    messages: initialMessages,
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

  // ── Voice start / connect / end (lifted from HugoVoicePanel) ──
  const startVoice = useCallback(async () => {
    if (isStarting || session) return;
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
  }, [activeConversationId, adoptConversationId, isStarting, session]);

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
  const orbState = isStarting ? "connecting" : voiceActive ? rt.orbState : "idle";
  const canInterrupt =
    rt.status === "connected" &&
    (rt.orbState === "speaking" || rt.orbState === "thinking");
  const isEmpty = transcript.length === 0 && !voiceActive;

  return (
    <div className={cn("relative flex h-full flex-col", className)}>
      {/* Hero orb — only while voice is live, centered near the top. */}
      {voiceActive && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
          <OrbSlot
            presence="hero"
            state={orbState}
            size={260}
            audioLevel={rt.audioLevel}
          />
        </div>
      )}

      {/* Transcript / greeting */}
      <div className="relative min-h-0 flex-1">
        {isEmpty ? (
          <div className="grid h-full place-items-center px-4">
            <Greeting onPick={(t) => setInput(t)} />
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
            <div
              className={cn(
                "mx-auto max-w-3xl pb-4",
                voiceActive ? "pt-[19rem]" : "pt-10",
              )}
            >
              <HugoTranscript messages={transcript} fill />
            </div>
          </div>
        )}

        {/* Corner orb — small ambient presence; click to start voice. */}
        {!voiceActive && (
          <div className="absolute right-4 top-2 z-10">
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
              <Badge variant={rt.orbState === "speaking" ? "cyan" : "blue"}>
                {isStarting ? "Connecting…" : statusLabel(rt.orbState)}
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText();
            }}
            className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface-elevated/50 p-2 backdrop-blur-sm focus-within:border-hugo-cyan/40"
          >
            <div className="flex items-end gap-2">
            {/* Mic toggle */}
            <Button
              type="button"
              variant={voiceActive ? "primary" : "subtle"}
              size="icon"
              onClick={() => (voiceActive ? void endVoice() : void startVoice())}
              aria-pressed={voiceActive}
              aria-label={voiceActive ? "End voice session" : "Start voice"}
              className="shrink-0 rounded-full"
            >
              <Mic aria-hidden />
            </Button>

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
            </div>

            {/* Composer toolbar */}
            <div className="flex items-center gap-2 px-1">
              <ModelMenu />
            </div>
          </form>

          {isStreaming && (
            <div className="mt-1.5 flex items-center gap-2 px-2" aria-live="polite">
              <Spinner />
              <span className="text-xs font-mono text-text-muted">
                {status === "submitted"
                  ? "Hugo is thinking…"
                  : "Hugo is responding…"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(state: string): string {
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
      return "Running tool";
    default:
      return "Voice live";
  }
}

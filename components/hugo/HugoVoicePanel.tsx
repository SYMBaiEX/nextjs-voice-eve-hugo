"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useHugoRealtime, type HugoRealtimeSession } from "@/hooks/useHugoRealtime";
import { OrbSlot } from "@/components/hugo/OrbSlot";
import { HugoSessionControls } from "@/components/hugo/HugoSessionControls";
import { HugoTranscript, type TranscriptMessage } from "@/components/hugo/HugoTranscript";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * HugoVoicePanel — the realtime voice experience (PRD 5.4).
 *
 * Orchestrates: POST /api/voice/session/start -> useHugoRealtime -> connect +
 * mic. The orb is the hero, with session controls and a live transcript below.
 * Finalized transcript turns are persisted to Convex best-effort (deduped by
 * message id via a ref Set). On any start/connect failure it toasts and calls
 * `onFallbackToText` so the surface can drop back to text chat.
 */

interface VoiceSessionStartResponse {
  voiceSessionId: string;
  conversationId: string;
  model: string;
  sessionConfig: {
    instructions: string;
    voice: string;
  };
  voice: string;
}

/** Minimal shape we read off realtime messages for persistence. Realtime
 *  UIMessage text parts carry a `state` of "streaming" | "done". */
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

/** A turn is safe to persist only once its text is finalized — i.e. it has
 *  text and no text part is still streaming. This prevents storing the first
 *  partial chunk of an in-progress turn (the text grows in place across renders). */
function isFinalized(message: RealtimeTurnLike): boolean {
  if (!Array.isArray(message.parts)) return !!(message.content ?? "").trim();
  const textParts = message.parts.filter(
    (p) => p.type === "text" && typeof p.text === "string" && p.text.length > 0,
  );
  if (textParts.length === 0) return false;
  return textParts.every((p) => p.state !== "streaming");
}

/** Finalize a voice session server-side (stamps duration + meters usage).
 *  Uses `sendBeacon` on page-unload — where a normal fetch is cancelled — and a
 *  keepalive fetch otherwise, so the session is always closed even on tab close,
 *  navigation, or a Voice→Text tab switch. The end mutation is idempotent. */
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

/** A previously-persisted turn (earlier voice or text) shown above the live
 *  session so a conversation can be picked back up in voice. */
export interface PriorTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  /** The realtime SDK message id this turn was persisted from (voice turns).
   *  Used to dedupe against the live transcript so finalized turns don't double. */
  sourceId?: string;
}

export function HugoVoicePanel({
  conversationId,
  priorTurns,
  onConversationId,
  onFallbackToText,
  className,
}: {
  conversationId?: string;
  priorTurns?: readonly PriorTurn[];
  onConversationId?: (conversationId: string) => void;
  onFallbackToText?: () => void;
  className?: string;
}) {
  const [session, setSession] = useState<HugoRealtimeSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const appendVoiceTurn = useMutation(api.messages.appendVoiceTurn);
  const persistedIds = useRef<Set<string>>(new Set());

  const rt = useHugoRealtime(session);

  // Keep the latest realtime messages reachable from imperative flush calls
  // (updated post-commit, not during render).
  const messagesRef = useRef(rt.messages);
  useEffect(() => {
    messagesRef.current = rt.messages;
  }, [rt.messages]);

  // Keep the latest session reachable from teardown paths (unmount, page
  // unload) whose effects run with stale closures.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Surface realtime errors and fall back to text.
  const reportedError = useRef<string | null>(null);
  useEffect(() => {
    if (rt.error && rt.error !== reportedError.current) {
      reportedError.current = rt.error;
      toast.error(rt.error || "Voice connection failed.");
      onFallbackToText?.();
    }
  }, [rt.error, onFallbackToText]);

  // Persist FINALIZED transcript turns only (best-effort, deduped by id). The
  // dedupe lock is added after a turn is finalized, so we store the complete
  // turn text — not the first streamed fragment.
  const flushTurns = useCallback(
    (activeSession: HugoRealtimeSession) => {
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
          voiceSessionId: activeSession.voiceSessionId as Id<"voiceSessions">,
          sourceId: id,
          role,
          content: text,
        }).catch(() => {
          // Best-effort — drop the lock so a later pass can retry.
          persistedIds.current.delete(id);
        });
      }
    },
    [appendVoiceTurn],
  );

  useEffect(() => {
    if (!session) return;
    flushTurns(session);
  }, [rt.messages, session, flushTurns]);

  const startSession = useCallback(async () => {
    if (isStarting || session) return;
    setIsStarting(true);
    try {
      const res = await fetch("/api/voice/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Couldn't start a voice session.");
      }
      const data = (await res.json()) as VoiceSessionStartResponse;
      persistedIds.current = new Set();
      reportedError.current = null;
      setSession({
        voiceSessionId: data.voiceSessionId,
        conversationId: data.conversationId,
        instructions: data.sessionConfig.instructions,
        model: data.model,
        voice: data.voice,
      });
      // Lift the conversation id so the parent keeps voice + text in ONE
      // conversation (otherwise switching to text would fork a new thread).
      onConversationId?.(data.conversationId);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Couldn't start a voice session.";
      toast.error(message);
      onFallbackToText?.();
      setSession(null);
    } finally {
      setIsStarting(false);
    }
  }, [conversationId, isStarting, session, onFallbackToText, onConversationId]);

  // Connect + open the mic once the session is established.
  const connect = useCallback(async () => {
    try {
      await rt.connect();
      await rt.toggleMic();
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Couldn't connect to Hugo.";
      toast.error(message);
      onFallbackToText?.();
    }
  }, [rt, onFallbackToText]);

  // Auto-connect right after a session is set.
  const connectedFor = useRef<string | null>(null);
  useEffect(() => {
    if (session && connectedFor.current !== session.voiceSessionId) {
      connectedFor.current = session.voiceSessionId;
      void connect();
    }
  }, [session, connect]);

  const endSession = useCallback(async () => {
    const active = session;
    // Flush any finalized-but-unpersisted turns BEFORE tearing down, so the last
    // turn isn't lost when switching to text mid-session.
    if (active) flushTurns(active);
    rt.disconnect();
    setSession(null);
    connectedFor.current = null;
    if (!active) return;
    try {
      await fetch("/api/voice/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceSessionId: active.voiceSessionId,
          conversationId: active.conversationId,
          interruptionCount: 0,
        }),
      });
    } catch {
      // Non-fatal: the session is already torn down client-side.
    }
  }, [rt, session, flushTurns]);

  // Reliable teardown for the IMPLICIT exits the explicit end button doesn't
  // cover — closing the tab, navigating away, or switching to the Text tab
  // (which unmounts this panel). Without this, the voiceSession is left "active"
  // and its minutes are never metered. The server end is idempotent, so this is
  // safe alongside an explicit endSession().
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
      // React unmount (Voice→Text tab switch, route change): the page is still
      // alive, so flush the last turns and end via keepalive fetch, then drop
      // the realtime connection.
      const active = sessionRef.current;
      if (active) {
        flushTurns(active);
        endVoiceSessionRequest(active);
      }
      rt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idle = !session && !isStarting;
  const orbState = isStarting ? "connecting" : rt.orbState;

  // Show earlier conversation turns (prior voice + text) above the live session
  // so a conversation can be picked back up in voice with full context. Drop any
  // prior turn already present live — deduped by the realtime message id we
  // persisted as `sourceId` — so finalized turns never appear twice.
  const liveMessages = rt.messages as readonly TranscriptMessage[];
  const transcriptMessages = useMemo<readonly TranscriptMessage[]>(() => {
    if (!priorTurns || priorTurns.length === 0) return liveMessages;
    const liveIds = new Set(
      liveMessages.map((m) => m.id).filter((id): id is string => !!id),
    );
    const prior: TranscriptMessage[] = priorTurns
      .filter((p) => !p.sourceId || !liveIds.has(p.sourceId))
      .map((p) => ({
        id: p.id,
        role: p.role,
        content: p.content,
        createdAt: p.createdAt,
      }));
    return [...prior, ...liveMessages];
  }, [priorTurns, liveMessages]);

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      {/* Orb hero — the shared app-layer orb docks here and reflects live
          realtime state + audio while this panel is mounted. */}
      <div className="relative grid place-items-center py-4">
        <OrbSlot
          state={orbState}
          size={280}
          audioLevel={rt.audioLevel}
          onClick={idle ? () => void startSession() : undefined}
        />
      </div>

      {idle ? (
        <div className="flex flex-col items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void startSession()}
            aria-label="Talk to Hugo"
          >
            <Mic aria-hidden />
            Talk to Hugo
          </Button>
          <p className="text-xs font-mono text-text-muted">
            Tap the orb or the button to begin a voice session.
          </p>
        </div>
      ) : isStarting ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Spinner />
          <span className="font-mono">Starting session…</span>
        </div>
      ) : (
        <HugoSessionControls
          orbState={rt.orbState}
          isCapturing={rt.isCapturing}
          status={rt.status}
          onConnect={() => void connect()}
          onDisconnect={() => void endSession()}
          onToggleMic={() => void rt.toggleMic()}
          onInterrupt={() => rt.interrupt()}
          onSwitchToText={() => {
            void endSession();
            onFallbackToText?.();
          }}
          className="w-full max-w-md"
        />
      )}

      <HugoTranscript messages={transcriptMessages} className="w-full" />
    </div>
  );
}

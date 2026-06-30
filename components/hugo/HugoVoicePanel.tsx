"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function HugoVoicePanel({
  conversationId,
  onFallbackToText,
  className,
}: {
  conversationId?: string;
  onFallbackToText?: () => void;
  className?: string;
}) {
  const [session, setSession] = useState<HugoRealtimeSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const appendMessage = useMutation(api.messages.append);
  const persistedIds = useRef<Set<string>>(new Set());
  const turnCount = useRef(0);

  const rt = useHugoRealtime(session);

  // Keep the latest realtime messages reachable from imperative flush calls
  // (updated post-commit, not during render).
  const messagesRef = useRef(rt.messages);
  useEffect(() => {
    messagesRef.current = rt.messages;
  }, [rt.messages]);

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
    (conversationId: string) => {
      for (const raw of messagesRef.current as RealtimeTurnLike[]) {
        const id = raw.id;
        const role = raw.role;
        if (!id || persistedIds.current.has(id)) continue;
        if (role !== "user" && role !== "assistant") continue;
        if (!isFinalized(raw)) continue;
        const text = turnText(raw);
        if (!text) continue;

        persistedIds.current.add(id);
        turnCount.current += 1;
        void appendMessage({
          conversationId: conversationId as Id<"conversations">,
          role,
          modality: "audio",
          content: text,
        }).catch(() => {
          // Best-effort — drop the lock so a later pass can retry.
          persistedIds.current.delete(id);
        });
      }
    },
    [appendMessage],
  );

  useEffect(() => {
    if (!session) return;
    flushTurns(session.conversationId);
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
      turnCount.current = 0;
      reportedError.current = null;
      setSession({
        voiceSessionId: data.voiceSessionId,
        conversationId: data.conversationId,
        model: data.model,
        voice: data.voice,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Couldn't start a voice session.";
      toast.error(message);
      onFallbackToText?.();
      setSession(null);
    } finally {
      setIsStarting(false);
    }
  }, [conversationId, isStarting, session, onFallbackToText]);

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
    if (active) flushTurns(active.conversationId);
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
          turnCount: turnCount.current,
          interruptionCount: 0,
        }),
      });
    } catch {
      // Non-fatal: the session is already torn down client-side.
    }
  }, [rt, session, flushTurns]);

  // Clean up the realtime connection on unmount.
  useEffect(() => {
    return () => {
      rt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idle = !session && !isStarting;
  const orbState = isStarting ? "connecting" : rt.orbState;
  const transcriptMessages = rt.messages as readonly TranscriptMessage[];

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

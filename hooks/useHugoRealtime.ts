"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { experimental_useRealtime as useRealtime } from "@ai-sdk/react";
import { gateway } from "@ai-sdk/gateway";
import { utils } from "animejs";
import type { HugoOrbState } from "@/lib/types";

/**
 * useHugoRealtime — the realtime voice core (PRD 5.4).
 *
 * Wraps AI SDK v7's `experimental_useRealtime` + AI Gateway realtime codec. The
 * browser never sees the gateway API key: it POSTs to our protected token
 * endpoint, which mints a short-lived token server-side. Supports server-VAD
 * turn detection, barge-in (cancelResponse), live transcript, and graceful
 * error → text fallback signaling.
 *
 * Also exposes a smoothed `audioLevel` (0..1) for the audio-reactive orb
 * (PRD 5.3): it tracks real mic amplitude while listening, and synthesizes a
 * gentle organic pulse while Hugo speaks (the SDK owns the output stream and it
 * is not readily tappable). Level decays smoothly to 0 when idle and is forced
 * to 0 whenever the session is disconnected.
 */

export interface HugoRealtimeSession {
  voiceSessionId: string;
  conversationId: string;
  instructions: string;
  model: string;
  voice: string;
}

export interface UseHugoRealtimeResult {
  orbState: HugoOrbState;
  status: "disconnected" | "connecting" | "connected" | "error";
  isCapturing: boolean;
  isPlaying: boolean;
  /** UIMessage[] transcript turns from the realtime session. */
  messages: ReturnType<typeof useRealtime>["messages"];
  error: string | null;
  /** Smoothed amplitude 0..1 for the audio-reactive orb. 0 when disconnected. */
  audioLevel: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMic: () => Promise<void>;
  /** Barge-in: stop Hugo mid-response. */
  interrupt: () => void;
  sendText: (text: string) => void;
}

// State updates are throttled to ~18fps to avoid render thrash; the rAF loop
// itself runs every frame so the smoothing stays buttery.
const LEVEL_STATE_INTERVAL_MS = 55;
// Per-frame smoothing factor toward the instantaneous target (lerp t).
const LEVEL_ATTACK = 0.35;
const LEVEL_DECAY = 0.12;
const FALLBACK_REALTIME_INSTRUCTIONS =
  "You are Hugo, a concise realtime voice agent. Speak in short natural turns, use tools only when helpful, and recover gracefully from errors.";

export function useHugoRealtime(
  session: HugoRealtimeSession | null,
): UseHugoRealtimeResult {
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);

  // --- Audio-reactive analyser plumbing ---------------------------------
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const freqBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // Smoothed level lives in a ref so the rAF loop has no stale-closure issues
  // and so we can read it without forcing a render every frame.
  const levelRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastStatePushRef = useRef(0);
  // Snapshot of the live realtime flags, kept fresh for the rAF loop.
  const flagsRef = useRef({ isCapturing: false, isPlaying: false });

  const model = useMemo(
    () =>
      gateway.experimental_realtime(
        session?.model ?? "openai/gpt-realtime-2",
      ),
    [session?.model],
  );

  const tokenEndpoint = session
    ? `/api/realtime/token?session=${encodeURIComponent(session.voiceSessionId)}`
    : "/api/realtime/token";

  const sessionConfig = useMemo(
    () => ({
      inputAudioTranscription: {},
      instructions: session?.instructions ?? FALLBACK_REALTIME_INSTRUCTIONS,
      voice: session?.voice ?? "alloy",
      turnDetection: { type: "server-vad" as const },
    }),
    [session?.instructions, session?.voice],
  );

  const realtime = useRealtime({
    model,
    api: { token: tokenEndpoint },
    onToolCall: async ({ toolCall }) => {
      if (!session) {
        return { error: "A voice session is required to run Hugo tools." };
      }

      const response = await fetch("/api/realtime/tool", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          args: toolCall.args,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          voiceSessionId: session.voiceSessionId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        return { error: payload?.error ?? "Realtime tool execution failed." };
      }

      return await response.json();
    },
    sessionConfig,
    onError: (e: Error) => setError(e.message),
  });

  const {
    status,
    isCapturing,
    isPlaying,
    messages,
    connect: rawConnect,
    disconnect: rawDisconnect,
    startAudioCapture,
    stopAudioCapture,
    cancelResponse,
    sendTextMessage,
  } = realtime;

  // Keep the rAF loop's view of the live flags current without re-subscribing.
  useEffect(() => {
    flagsRef.current = { isCapturing, isPlaying };
  }, [isCapturing, isPlaying]);

  // Tear down the AudioContext / analyser chain. Safe to call repeatedly.
  const teardownAnalyser = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      // already disconnected
    }
    sourceNodeRef.current = null;
    analyserRef.current = null;
    freqBufferRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      // close() returns a promise; we don't await it during cleanup.
      void ctx.close().catch(() => {});
    }
  }, []);

  // Build an AnalyserNode chain over the live mic stream so we can read real
  // amplitude while the user speaks. Feature-detected and fully guarded.
  const setupMicAnalyser = useCallback((stream: MediaStream) => {
    try {
      const Ctor =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext
          : undefined;
      if (!Ctor) return; // no Web Audio support → silently skip (mic still works)

      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      // NOTE: we intentionally do NOT connect the analyser to ctx.destination —
      // that would echo the mic back through the speakers.

      audioContextRef.current = ctx;
      sourceNodeRef.current = source;
      analyserRef.current = analyser;
      freqBufferRef.current = new Uint8Array(
        new ArrayBuffer(analyser.frequencyBinCount),
      );
    } catch {
      // AudioContext unavailable / blocked → degrade gracefully, no orb pulse.
      teardownAnalyser();
    }
  }, [teardownAnalyser]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await rawConnect();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to connect";
      setError(message);
      throw e;
    }
  }, [rawConnect]);

  const stopMic = useCallback(() => {
    stopAudioCapture();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    teardownAnalyser();
  }, [stopAudioCapture, teardownAnalyser]);

  const disconnect = useCallback(() => {
    stopMic();
    rawDisconnect();
  }, [rawDisconnect, stopMic]);

  const toggleMic = useCallback(async () => {
    if (isCapturing) {
      stopMic();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      startAudioCapture(stream);
      // Tap the same stream for amplitude analysis (orb reactivity).
      setupMicAnalyser(stream);
    } catch {
      setError("Microphone permission is required to talk to Hugo.");
    }
  }, [isCapturing, startAudioCapture, stopMic, setupMicAnalyser]);

  // Clean up any open mic stream + analyser on unmount.
  useEffect(() => () => stopMic(), [stopMic]);

  // --- Audio-reactive rAF loop ------------------------------------------
  // Runs only while connected. Computes a per-frame target level, smooths it
  // toward via lerp, and pushes throttled React state so the orb can pulse.
  useEffect(() => {
    if (status !== "connected") {
      // Not connected → ensure level is zeroed and no loop is running.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      levelRef.current = 0;
      // Defer state reset out of the effect body via rAF to keep it lint-safe
      // and avoid a synchronous setState during render commit.
      const id = requestAnimationFrame(() => setAudioLevel(0));
      return () => cancelAnimationFrame(id);
    }

    const startedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const tick = () => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const { isCapturing: capturing, isPlaying: playing } = flagsRef.current;

      let target = 0;

      if (capturing && analyserRef.current && freqBufferRef.current) {
        // Real mic amplitude via frequency-domain RMS, normalized to ~0..1.
        const analyser = analyserRef.current;
        const buf = freqBufferRef.current;
        analyser.getByteFrequencyData(buf);
        let sumSquares = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i] / 255; // 0..1
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / buf.length);
        // Voice rarely fills the whole 0..1 range; gently expand for liveliness.
        target = utils.clamp(rms * 2.2, 0, 1);
      } else if (capturing) {
        // Capturing but no analyser (Web Audio unavailable) → soft idle pulse.
        const t = (now - startedAt) / 1000;
        target = 0.15 + 0.1 * (0.5 + 0.5 * Math.sin(t * 3));
      } else if (playing) {
        // Hugo speaking, output stream not tappable → synthesize an organic,
        // breathing pulse from layered low-frequency sines (0.3..0.8).
        const t = (now - startedAt) / 1000;
        const wave =
          0.55 +
          0.18 * Math.sin(t * 6.3) +
          0.07 * Math.sin(t * 11.7 + 1.3) +
          0.04 * Math.sin(t * 2.1 + 0.6);
        target = utils.clamp(wave, 0.3, 0.8);
      }

      // Smooth toward target: faster attack (rising), slower decay (falling).
      const t = target > levelRef.current ? LEVEL_ATTACK : LEVEL_DECAY;
      levelRef.current = utils.lerp(levelRef.current, target, t);
      if (levelRef.current < 0.001) levelRef.current = 0;

      // Throttle React state pushes to ~18fps.
      if (now - lastStatePushRef.current >= LEVEL_STATE_INTERVAL_MS) {
        lastStatePushRef.current = now;
        setAudioLevel(Math.round(levelRef.current * 1000) / 1000);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status]);

  const orbState = useMemo<HugoOrbState>(() => {
    if (status === "error" || error) return "error";
    if (!session) return "auth_required";
    if (status === "connecting") return "connecting";
    if (status === "disconnected") return "idle";
    // connected:
    if (isPlaying) return "speaking";
    if (isCapturing) return "listening";
    // Connected but neither capturing nor playing → genuinely idle (mic muted or
    // between turns). Don't misreport this as perpetual "thinking".
    return "idle";
  }, [status, error, session, isPlaying, isCapturing]);

  return {
    orbState,
    status,
    isCapturing,
    isPlaying,
    messages,
    error,
    audioLevel: status === "disconnected" ? 0 : audioLevel,
    connect,
    disconnect,
    toggleMic,
    interrupt: cancelResponse,
    sendText: sendTextMessage,
  };
}

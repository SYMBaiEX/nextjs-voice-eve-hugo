"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useWakeWord — an opt-in "Hey Hugo" wake word using the browser's built-in
 * Speech Recognition API (PRD 5.4 "Jarvis" buildout).
 *
 * Continuously listens (when `enabled`) and watches interim/final transcripts
 * for a "hey hugo" match; on a match it stops itself and calls `onWake` — the
 * caller starts the REAL voice session (a separate mic stream via
 * `useHugoRealtime`). This is deliberately the simpler of the two wake-word
 * approaches (vs. an on-device WASM/ONNX keyword-spotting model): no new
 * dependency, ships now, but only works in Chrome/Edge-family browsers and
 * sends ambient audio to the browser vendor's speech service while listening
 * — `supported` lets the caller hide the feature where it can't work, and
 * this is opt-in with a visible indicator, never silently on.
 *
 * Never runs while a real voice session is active (the caller must gate
 * `enabled` on `!voiceActive` — a wake-word listener and the real session
 * must not fight over the microphone).
 */

interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const WAKE_PHRASE = /\bhe?y,?\s+hugo\b/i;
// A real permission/config error repeats immediately on restart; give up
// after a few consecutive instant failures rather than spinning forever.
const MAX_CONSECUTIVE_FAILURES = 3;

export function useWakeWord({
  enabled,
  onWake,
}: {
  enabled: boolean;
  onWake: () => void;
}): { supported: boolean; listening: boolean } {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => getSpeechRecognitionCtor() !== null);
  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    const stopListening = () => setListening(false);
    if (!enabled || !supported) {
      stopListening();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    let stopped = false;
    let recognition: SpeechRecognitionLike | null = null;
    let consecutiveFailures = 0;
    let startedAt = 0;

    const cleanup = () => {
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.abort();
        } catch {
          // already stopped
        }
        recognition = null;
      }
    };

    const startOnce = () => {
      if (stopped) return;
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i]?.[0]?.transcript ?? "";
          if (WAKE_PHRASE.test(transcript)) {
            stopped = true;
            setListening(false);
            cleanup();
            onWakeRef.current();
            return;
          }
        }
      };
      recognition.onerror = () => {
        consecutiveFailures++;
      };
      recognition.onend = () => {
        setListening(false);
        if (stopped) return;
        // Browsers end recognition after silence/a fixed duration — this is
        // normal, not an error; restart unless it just failed immediately
        // several times in a row (a real permission/config problem).
        const ranFor = Date.now() - startedAt;
        if (ranFor < 500) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
        }
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stopped = true;
          return;
        }
        startOnce();
      };

      startedAt = Date.now();
      try {
        recognition.start();
        setListening(true);
      } catch {
        consecutiveFailures++;
        setListening(false);
      }
    };

    startOnce();

    return () => {
      stopped = true;
      setListening(false);
      cleanup();
    };
  }, [enabled, supported]);

  return { supported, listening };
}

"use client";

/**
 * Tiny synthesized chime set for voice-session feedback (PRD 5.3/5.4).
 *
 * No audio assets — every chime is a short `OscillatorNode` + `GainNode`
 * envelope (<300ms), sharing one lazily-created `AudioContext` so repeated
 * calls don't leak nodes. Callers gate these on `useReducedMotion()` (the
 * same flag `HugoOrb.tsx` already uses to skip its own looping animation) —
 * a user who's asked for less motion shouldn't get new sound effects either.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new Ctor();
  }
  if (sharedContext.state === "suspended") {
    void sharedContext.resume().catch(() => {});
  }
  return sharedContext;
}

interface Tone {
  freq: number;
  /** Seconds from now. */
  startAt: number;
  duration: number;
  gain?: number;
  type?: OscillatorType;
}

// Extra settle time after the last tone's scheduled end, beyond which we
// consider the speaker acoustically quiet again. Real playback isn't
// instant-off (room decay, hardware/driver latency), so callers that are
// about to open the microphone must wait this long past the chime — see the
// note on `playConnectChime`/`playMicToggleBlip` below for why this matters.
const SETTLE_MS = 150;

function playTones(tones: Tone[]): Promise<void> {
  const ctx = getContext();
  if (!ctx) return Promise.resolve();
  try {
    const now = ctx.currentTime;
    let maxEndOffset = 0;
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = t.type ?? "sine";
      osc.frequency.value = t.freq;
      const start = now + t.startAt;
      const end = start + t.duration;
      const peak = t.gain ?? 0.07;
      // Short linear envelope — no clicks at the on/off edges.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.02, t.duration / 3));
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
      maxEndOffset = Math.max(maxEndOffset, t.startAt + t.duration);
    }
    return new Promise((resolve) =>
      setTimeout(resolve, maxEndOffset * 1000 + SETTLE_MS),
    );
  } catch {
    // Audio is a nicety, never worth surfacing an error for.
    return Promise.resolve();
  }
}

/**
 * A voice session just connected — two soft ascending tones.
 *
 * Resolves only once the tones have actually finished playing (+ a settle
 * buffer), not just been scheduled — the caller MUST await this before
 * opening the microphone. Without that, the chime is still audible through
 * the speakers at the exact moment mic capture begins, and without
 * hardware-level echo cancellation on the synthesized tone, it can bleed
 * back into the mic and get mistaken for real speech (a real regression:
 * the realtime API hallucinated a short transcript from the chime itself
 * and Hugo responded to it as if the user had spoken).
 */
export function playConnectChime(): Promise<void> {
  return playTones([
    { freq: 660, startAt: 0, duration: 0.09 },
    { freq: 880, startAt: 0.08, duration: 0.12 },
  ]);
}

/** The mic was toggled on/off — one short blip, pitched by direction. Same
 *  mic-bleed hazard as `playConnectChime` when turning ON — the caller must
 *  await this before starting capture. Turning off is already safe (capture
 *  has already stopped by the time this plays). */
export function playMicToggleBlip(micOn: boolean): Promise<void> {
  return playTones([
    { freq: micOn ? 720 : 460, startAt: 0, duration: 0.06, gain: 0.06 },
  ]);
}

/** Barge-in — the user interrupted Hugo mid-response. */
export function playBargeInBlip(): Promise<void> {
  return playTones([
    { freq: 520, startAt: 0, duration: 0.05, gain: 0.07, type: "triangle" },
  ]);
}

/** A realtime session error — two soft descending tones, distinct from the
 *  connect chime's ascending pair without being harsh. */
export function playErrorChime(): Promise<void> {
  return playTones([
    { freq: 392, startAt: 0, duration: 0.11, gain: 0.07 },
    { freq: 293, startAt: 0.1, duration: 0.16, gain: 0.07 },
  ]);
}

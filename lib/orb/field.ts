/**
 * Field style — the ambient GPU layer's per-state look, kept in lockstep with
 * the orb's STATE_STYLE (components/hugo/HugoOrb.tsx) so the GPU haze, the
 * blurred glow divs, and the SVG orb always agree on color and energy.
 *
 * Colors are derived from lib/constants.ts PALETTE (the JS mirror of the CSS
 * design tokens) as linear 0..1 RGB triples, ready to feed straight into a
 * shader uniform — never read CSS vars on the GPU. This is the single source of
 * truth for the field's tint, so a per-state color change ripples through
 * field → glow → orb as one coordinated breath.
 */

import type { HugoOrbState } from "@/lib/types";
import { PALETTE } from "@/lib/constants";

export interface FieldStyle {
  /** Tint as 0..1 RGB, fed directly to the shader color uniform. */
  color: readonly [number, number, number];
  /** Ambient bloom intensity 0..1 (mirrors STATE_STYLE.glow). */
  glow: number;
  /** Flow/drift speed multiplier — glacial when calm, faster when active. */
  flow: number;
  /** Whether the field should swell with live mic/voice amplitude. */
  audioReactive: boolean;
}

/** Parse "#rrggbb" → [r, g, b] in 0..1. Pure; runs at module load. */
function hexToRgb(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255] as const;
}

const CYAN = hexToRgb(PALETTE.cyan);
const BLUE = hexToRgb(PALETTE.blue);
const MAGENTA = hexToRgb(PALETTE.magenta);
const ERROR = hexToRgb(PALETTE.error);
const MUTED = hexToRgb(PALETTE.muted);

/** Per-state field look. Mirrors HugoOrb's STATE_STYLE color/glow language. */
export const FIELD_STYLE: Record<HugoOrbState, FieldStyle> = {
  idle: { color: CYAN, glow: 0.45, flow: 0.5, audioReactive: false },
  auth_required: { color: MUTED, glow: 0.18, flow: 0.22, audioReactive: false },
  connecting: { color: BLUE, glow: 0.62, flow: 0.85, audioReactive: false },
  listening: { color: CYAN, glow: 0.85, flow: 0.9, audioReactive: true },
  thinking: { color: BLUE, glow: 0.7, flow: 1.45, audioReactive: false },
  speaking: { color: CYAN, glow: 1.0, flow: 1.1, audioReactive: true },
  interrupted: { color: MAGENTA, glow: 0.72, flow: 1.7, audioReactive: false },
  tool_running: { color: MAGENTA, glow: 0.82, flow: 1.3, audioReactive: false },
  error: { color: ERROR, glow: 0.75, flow: 1.5, audioReactive: false },
  sleeping: { color: MUTED, glow: 0.12, flow: 0.14, audioReactive: false },
};

/** Safe lookup with an idle fallback for unknown states. */
export function fieldStyleFor(state: HugoOrbState): FieldStyle {
  return FIELD_STYLE[state] ?? FIELD_STYLE.idle;
}

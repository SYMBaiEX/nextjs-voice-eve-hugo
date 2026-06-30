"use client";

import type { HugoOrbState } from "@/lib/types";
import { HugoOrb } from "@/components/hugo/HugoOrb";
import { HugoAmbientField } from "@/components/hugo/HugoAmbientField";
import { cn } from "@/lib/utils";

/**
 * HugoOrbStage — the full three-layer orb presence (PRD 5.3, uplift).
 *
 * Composites, back-to-front: the GPU ambient field (atmosphere, extends beyond
 * the orb and dissolves into the void) → the SVG orb with its own blurred glow
 * divs (the instrument). All layers read the SAME `state` + `audioLevel`, so a
 * state change ripples through field → glow → orb as one coordinated breath.
 *
 * Drop-in replacement for <HugoOrb> at the hero/console scale. The field is
 * client-only and degrades to a CSS tint when WebGPU is unavailable, so the orb
 * composition is identical with or without a GPU.
 */
export function HugoOrbStage({
  state = "idle",
  size = 280,
  audioLevel,
  active = true,
  onClick,
  className,
}: {
  state?: HugoOrbState;
  size?: number;
  audioLevel?: number;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Layer 1 — GPU ambient field, much larger than the orb so its glow
          fades into the void well beyond the orb instead of being clipped. */}
      <div className="pointer-events-none absolute -inset-[65%] z-0">
        <HugoAmbientField
          state={state}
          audioLevel={audioLevel}
          active={active}
        />
      </div>

      {/* Layers 2 + 3 — blurred glow divs + the SVG orb (the instrument). */}
      <div className="relative z-10">
        <HugoOrb
          state={state}
          size={size}
          audioLevel={audioLevel}
          active={active}
          onClick={onClick}
        />
      </div>
    </div>
  );
}

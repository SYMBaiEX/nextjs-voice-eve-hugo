"use client";

import { useEffect, useId, useRef } from "react";
import type { HugoOrbState } from "@/lib/types";
import { useOrbStage } from "@/components/hugo/orb-stage";
import { cn } from "@/lib/utils";

/**
 * OrbSlot — a page's claim on the shared app-layer orb.
 *
 * Renders an invisible placeholder that reserves `size`×`size` of layout, then
 * tells <OrbStageProvider> "the orb belongs here". The real (singleton) orb
 * floats over this slot and springs to it on navigation. Pass `state` /
 * `audioLevel` to drive the orb's look (e.g. the live realtime state on the
 * voice console), and `onClick` to make it interactive on this page.
 */
export function OrbSlot({
  size = 280,
  state = "idle",
  audioLevel,
  onClick,
  className,
}: {
  size?: number | string;
  state?: HugoOrbState;
  audioLevel?: number;
  onClick?: () => void;
  className?: string;
}) {
  const api = useOrbStage();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onClick);
  // Keep the latest handler reachable from the orb's click without re-registering.
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);
  const interactive = !!onClick;

  // Register the measured element on mount; re-register only if interactivity
  // flips. Dynamic state/audio are pushed separately so audio updates (~18fps)
  // never re-register or re-measure.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    api.register({
      id,
      el,
      state,
      audioLevel: audioLevel ?? 0,
      interactive,
      getOnClick: () => onClickRef.current,
    });
    return () => api.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, api, interactive]);

  useEffect(() => {
    api.update(id, { state, audioLevel: audioLevel ?? 0 });
  }, [id, api, state, audioLevel]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none", className)}
      style={{ width: size, height: size }}
    />
  );
}

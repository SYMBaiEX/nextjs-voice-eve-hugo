"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  createScope,
  createTimeline,
  createTimer,
  createAnimatable,
  stagger,
  svg,
  utils,
  type Scope,
  type AnimatableObject,
  type JSAnimation,
  type Timeline,
  type Timer,
} from "animejs";
import { useDocumentVisible } from "@/components/motion/useReducedMotion";
import { cn } from "@/lib/utils";
import type { HugoOrbState } from "@/lib/types";

/**
 * HugoOrb — the product centerpiece (PRD 5.3).
 *
 * A layered, dimensional command orb driven entirely by Anime.js v4. The orb is
 * one responsive <svg viewBox="0 0 400 400"> stacked over a couple of blurred
 * div glow layers. A per-state controller transitions motion smoothly on every
 * realtime state change (no abrupt class swaps), and an audio-reactive rAF loop
 * pushes live amplitude into cheap `createAnimatable` setters while
 * listening/speaking. Honors prefers-reduced-motion with a calm fallback.
 *
 * Public API is stable: callers pass { state, size, audioLevel, onClick,
 * className }. Exposes state to assistive tech via role/aria-label.
 */

/** Per-state palette + label. Colors resolve to theme CSS vars at paint time. */
interface StateStyle {
  label: string;
  color: string;
  glow: number; // 0..1 ambient glow intensity
  dim: number; // 0..1 overall opacity multiplier (1 = full)
}

const STATE_STYLE: Record<HugoOrbState, StateStyle> = {
  idle: { label: "Hugo is idle", color: "var(--hugo-cyan)", glow: 0.45, dim: 1 },
  auth_required: { label: "Sign in to talk to Hugo", color: "var(--text-muted)", glow: 0.2, dim: 0.6 },
  connecting: { label: "Hugo is connecting", color: "var(--hugo-blue)", glow: 0.6, dim: 1 },
  listening: { label: "Hugo is listening", color: "var(--hugo-cyan)", glow: 0.8, dim: 1 },
  thinking: { label: "Hugo is thinking", color: "var(--hugo-blue)", glow: 0.7, dim: 1 },
  speaking: { label: "Hugo is speaking", color: "var(--hugo-cyan)", glow: 1, dim: 1 },
  interrupted: { label: "Hugo was interrupted", color: "var(--accent-magenta)", glow: 0.7, dim: 1 },
  tool_running: { label: "Hugo is running a tool", color: "var(--accent-magenta)", glow: 0.8, dim: 1 },
  error: { label: "Hugo hit an error", color: "var(--error)", glow: 0.75, dim: 1 },
  sleeping: { label: "Hugo is sleeping", color: "var(--text-muted)", glow: 0.15, dim: 0.5 },
};

const AUDIO_STATES = new Set<HugoOrbState>(["listening", "speaking"]);

/**
 * Effects that build/tear down anime.js geometry must run in the LAYOUT phase,
 * not the passive phase. Reverting a motion-path or drawable animation re-reads
 * SVG geometry (getPointAtLength/getTotalLength) to restore initial values, and
 * the browser throws InvalidStateError ("inactive document") when that read
 * happens on a disconnected element. React runs passive (useEffect) cleanups
 * *after* it detaches the unmounted subtree from the DOM — so a useEffect-based
 * teardown races detachment and intermittently reads detached geometry. Layout
 * (useLayoutEffect) cleanups run *synchronously before* React removes the host
 * nodes, so revert always reads geometry while the SVG is still connected.
 *
 * useLayoutEffect warns under SSR, so fall back to useEffect on the server (the
 * effect bodies no-op there anyway — they bail when the DOM ref is null).
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Geometry helpers on the 0..400 viewBox (center 200,200). */
const C = 200;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Build an SVG arc path string for a partial circle (scan arc). */
function arcPath(r: number, startDeg: number, sweepDeg: number): string {
  const [x0, y0] = polar(C, C, r, startDeg);
  const [x1, y1] = polar(C, C, r, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Round to 2 decimals so SSR and client serialize SVG coords identically
 *  (full-precision floats can stringify differently and trip hydration). */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Radial tick marks around a radius — returns line coords. */
const TICKS = Array.from({ length: 48 }, (_, i) => {
  const deg = (i / 48) * 360;
  const major = i % 4 === 0;
  const rOuter = 150;
  const rInner = major ? 138 : 144;
  const [x1, y1] = polar(C, C, rInner, deg);
  const [x2, y2] = polar(C, C, rOuter, deg);
  return { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), major };
});

/** Outer segmented ring dash pattern (visual segments via dasharray). */
const SEG_DASH = "26 14";

/** Two waveform path variants the ribbon morphs between. */
const WAVE_FLAT = "M 130 200 L 270 200";
const WAVE_FULL =
  "M 130 200 Q 147 168 165 200 T 200 200 T 235 200 T 270 200";

export function HugoOrb({
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
  const style = STATE_STYLE[state];

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scopeRef = useRef<Scope | null>(null);
  const pageVisible = useDocumentVisible();
  const [inViewport, setInViewport] = useState(true);

  // Latest audio amplitude, read by the rAF loop without re-rendering. Kept
  // fresh via an effect (never written during render) for the lint rules.
  const audioRef = useRef(0);
  useEffect(() => {
    audioRef.current =
      typeof audioLevel === "number" && Number.isFinite(audioLevel) ? audioLevel : 0;
  }, [audioLevel]);

  // Imperative animatables for audio-reactive layers (assigned in the setup effect).
  const coreAnimRef = useRef<AnimatableObject | null>(null);
  const glowAnimRef = useRef<AnimatableObject | null>(null);
  const waveAnimRef = useRef<AnimatableObject | null>(null);
  const reducedRef = useRef(false);

  // Bumped (from the reduced-motion change handler) to re-run the per-state
  // controller for the new motion budget. Event-driven setState — not a render
  // or effect-time write — so it does not trip the set-state-in-effect rule.
  const [motionEpoch, setMotionEpoch] = useState(0);
  const motionActive = active && pageVisible && inViewport;

  useEffect(() => {
    if (!active || typeof IntersectionObserver === "undefined") return;

    const root = rootRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        const next = entries[0]?.isIntersecting ?? true;
        setInViewport((prev) => (prev === next ? prev : next));
      },
      { threshold: 0.01 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [active]);

  // ── One-time scene setup: build every layer's idle/loop motion inside a scope.
  // The per-state controller (below) layers transitions on top of this. Runs in
  // the layout phase so the teardown's scope.revert() reads SVG geometry while
  // the orb is still connected (see useIsomorphicLayoutEffect note above).
  useIsomorphicLayoutEffect(() => {
    if (!motionActive) return;

    const root = rootRef.current;
    if (!root) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Build the base scene inside a scope. Re-runs whenever reduced-motion flips.
    const build = (): Scope =>
      createScope({ root }).add(() => {
        const scopeRoot = root;
        const reduced = mq.matches;
        reducedRef.current = reduced;

        // Animatables for cheap per-frame audio updates (created in every mode so
        // the rAF loop always has setters; it simply no-ops under reduced motion).
        const coreEl = scopeRoot.querySelector<SVGGElement>(".hugo-core-group");
        const glowEl = scopeRoot.querySelector<HTMLElement>(".hugo-glow-audio");
        const waveEl = scopeRoot.querySelector<SVGGElement>(".hugo-wave");
        if (coreEl) {
          coreAnimRef.current = createAnimatable(coreEl, {
            scale: 1,
            duration: 120,
            ease: "out(2)",
          }) as AnimatableObject;
        }
        if (glowEl) {
          glowAnimRef.current = createAnimatable(glowEl, {
            opacity: 0,
            scale: 1,
            duration: 160,
            ease: "out(2)",
          }) as AnimatableObject;
        }
        if (waveEl) {
          waveAnimRef.current = createAnimatable(waveEl, {
            scaleY: 0.4,
            opacity: 0.5,
            duration: 90,
            ease: "out(2)",
          }) as AnimatableObject;
        }

        if (reduced) return; // No spins/orbits/draw under reduced motion.

        // 2. Outer + inner segmented rings — slow counter-rotation.
        animate(".hugo-ring-outer", { rotate: "1turn", loop: true, duration: 48000, ease: "linear" });
        animate(".hugo-ring-inner", { rotate: "-1turn", loop: true, duration: 36000, ease: "linear" });
        utils.set(".hugo-seg", { opacity: 0.5 });
        animate(".hugo-seg", {
          opacity: [0.18, 0.7],
          delay: stagger(90, { from: "first" }),
          duration: 2600,
          alternate: true,
          loop: true,
          ease: "inOutQuad",
        });

        // 4. Scan arcs sweep around the dial.
        animate(".hugo-scan-a", { rotate: "1turn", transformOrigin: "200px 200px", loop: true, duration: 9000, ease: "linear" });
        animate(".hugo-scan-b", { rotate: "-1turn", transformOrigin: "200px 200px", loop: true, duration: 13000, ease: "linear" });
        animate(".hugo-liquid-flow", { rotate: "1turn", transformOrigin: "200px 200px", loop: true, duration: 18000, ease: "linear" });
        animate(".hugo-liquid-counterflow", { rotate: "-1turn", transformOrigin: "200px 200px", loop: true, duration: 24000, ease: "linear" });
        animate(".hugo-glass-highlight", {
          opacity: [0.45, 0.9],
          duration: 3200,
          alternate: true,
          loop: true,
          ease: "inOutSine",
        });

        // 5. Orbiting nodes bound to invisible orbit paths via motion paths.
        // svg.createMotionPath / createDrawable call getPointAtLength/
        // getTotalLength on the SVG geometry, which throws if the element is in
        // an inactive document (it can briefly detach during the auth-gate
        // remount or a page navigation). Guard on connectedness + try/catch so a
        // teardown race never surfaces a runtime error — the nodes are
        // decorative and degrade gracefully.
        if (scopeRoot.isConnected) {
          try {
            const orbits = scopeRoot.querySelectorAll<SVGCircleElement>(".hugo-orbit-path");
            const nodes = scopeRoot.querySelectorAll<SVGCircleElement>(".hugo-node");
            orbits.forEach((orbit, i) => {
              const node = nodes[i];
              if (!node || !orbit.isConnected) return;
              const mp = svg.createMotionPath(orbit);
              animate(node, {
                ...mp,
                loop: true,
                duration: 7000 + i * 2600,
                ease: "linear",
                delay: i * 700,
              });
            });

            // 3. HUD line-drawn circles + ticks — faint at rest, fully drawn on connect.
            const drawables = svg.createDrawable(".hugo-draw");
            utils.set(drawables, { draw: "0 0.18" });
          } catch {
            // Geometry not measurable yet (detaching/inactive) — skip safely.
          }
        }
      });

    scopeRef.current = build();

    const onMq = () => {
      scopeRef.current?.revert();
      scopeRef.current = build();
      // Nudge the per-state controller to re-apply for the new motion budget.
      setMotionEpoch((n) => n + 1);
    };
    mq.addEventListener("change", onMq);

    return () => {
      mq.removeEventListener("change", onMq);
      // Layout-phase cleanup: the orb is still connected here, so reverting the
      // scope's motion-path/drawable animations can safely read SVG geometry.
      scopeRef.current?.revert();
      scopeRef.current = null;
      coreAnimRef.current = null;
      glowAnimRef.current = null;
      waveAnimRef.current = null;
    };
  }, [motionActive]);

  // ── Per-STATE controller. On each state change, smoothly transition the orb's
  // motion to that state. Stored handles are reverted before the next state runs.
  // Layout phase too: the cleanup reverts morphTo/drawable tweens that read SVG
  // geometry, so it must run before React detaches the orb on unmount.
  useIsomorphicLayoutEffect(() => {
    if (!motionActive) return;

    const root = rootRef.current;
    if (!root) return;

    const reduced = reducedRef.current;
    const st = STATE_STYLE[state];
    // All queries are scoped to THIS orb's root so multiple orbs on one page
    // never animate each other's layers (anime.js global selectors would).
    const q = (s: string) => root.querySelector<SVGElement>(s);
    const qa = (s: string) => Array.from(root.querySelectorAll<SVGElement>(s));

    // Transient handles created for THIS state, reverted on the next change.
    const handles: Array<JSAnimation | Timeline | Timer> = [];
    const track = <T extends JSAnimation | Timeline | Timer>(h: T): T => {
      handles.push(h);
      return h;
    };

    // Resolve the layers this controller drives, once, scoped to root.
    const coreEl = q(".hugo-core-group");
    // morphTo must run on the <path> itself, not the <g> wrapper.
    const wavePathEl = q(".hugo-wave-path");
    const innerSpin = qa(".hugo-inner-spin");
    const pulseRings = qa(".hugo-pulse");
    const pulseSingle = qa(".hugo-pulse-single");
    const nodes = qa(".hugo-node");
    const ticks = qa(".hugo-tick");
    const scanA = qa(".hugo-scan-a");
    const scanWrap = qa(".hugo-scan-wrap");
    const waveWrap = qa(".hugo-wave-wrap");
    const staticFade = qa(".hugo-static-fade");
    const glowAmbient = root.querySelector<HTMLElement>(".hugo-glow-ambient");

    // Crossfade the color of every accent layer to this state's color.
    animate(qa(".hugo-color"), { stroke: st.color, duration: 600, ease: "out(2)" });
    animate(qa(".hugo-color-fill"), { fill: st.color, duration: 600, ease: "out(2)" });

    // Ambient glow crossfade (handled on the blurred div via inline style + a tween).
    if (glowAmbient) {
      animate(glowAmbient, {
        opacity: st.glow * 0.55,
        scale: 0.92 + st.glow * 0.22,
        duration: 700,
        ease: "out(3)",
      });
    }

    if (reduced) {
      // Calm fallback: gentle opacity + tiny scale crossfades, color/glow only.
      if (coreEl) animate(coreEl, { scale: 1, opacity: st.dim, duration: 500, ease: "out(2)" });
      animate(staticFade, { opacity: st.dim, duration: 500, ease: "out(2)" });
      return () => handles.forEach((h) => h.revert());
    }

    // Default visibility for optional layers — each state overrides as needed.
    const showWave = state === "listening" || state === "speaking";
    animate(waveWrap, { opacity: showWave ? 1 : 0, duration: 400, ease: "out(2)" });
    if (wavePathEl) {
      animate(wavePathEl, {
        d: svg.morphTo(showWave ? "#hugo-wave-full" : "#hugo-wave-flat"),
        duration: 500,
        ease: "inOutQuad",
      });
    }

    // Orbiting nodes prominence (prominent on tool_running).
    const nodeProminence = state === "tool_running" ? 1 : state === "thinking" ? 0.55 : 0.3;
    animate(nodes, {
      opacity: nodeProminence,
      r: state === "tool_running" ? 4.5 : 2.6,
      duration: 500,
      ease: "out(2)",
    });

    switch (state) {
      case "idle": {
        track(
          animate(coreEl!, {
            scale: [1, 1.04],
            duration: 4500,
            alternate: true,
            loop: true,
            ease: "inOutSine",
          }),
        );
        track(animate(pulseRings, { opacity: 0, duration: 300 }));
        break;
      }

      case "auth_required": {
        track(
          animate(coreEl!, {
            scale: [1, 1.015],
            opacity: [0.5, 0.7],
            duration: 2600,
            alternate: true,
            loop: true,
            ease: "inOutQuad",
          }),
        );
        track(animate(pulseRings, { opacity: 0, duration: 300 }));
        break;
      }

      case "connecting": {
        // ASSEMBLE: draw HUD circles/ticks in with stagger, spin rings up.
        const drawables = svg.createDrawable(root.querySelectorAll<SVGGeometryElement>(".hugo-draw"));
        const tl = createTimeline({ defaults: { ease: "inOut(2)" } });
        tl.add(drawables, { draw: ["0 0", "0 1"], duration: 900, delay: stagger(80) }, 0);
        if (ticks.length) tl.add(ticks, { opacity: [0, 0.8], duration: 700, delay: stagger(14) }, 100);
        if (coreEl) tl.add(coreEl, { scale: [0.85, 1], opacity: [0.6, 1], duration: 900, ease: "out(3)" }, 0);
        if (scanWrap.length) tl.add(scanWrap, { opacity: [0, 1], duration: 600 }, 200);
        track(tl);
        track(
          animate(coreEl!, {
            scale: [1, 1.03],
            duration: 1600,
            alternate: true,
            loop: true,
            ease: "inOutSine",
          }),
        );
        break;
      }

      case "listening": {
        // The core scale + glow are owned by the audio rAF loop here (so the two
        // systems don't fight over the same transform). We only drive the rings.
        track(
          animate(pulseRings, {
            scale: [1, 2],
            opacity: [0.5, 0],
            duration: 2600,
            delay: stagger(650),
            loop: true,
            ease: "out(2)",
          }),
        );
        break;
      }

      case "thinking": {
        // Tight fast inner rotation + accelerated scans + micro jitter.
        track(
          animate(innerSpin, {
            rotate: "1turn",
            transformOrigin: "200px 200px",
            loop: true,
            duration: 2400,
            ease: "linear",
          }),
        );
        track(
          animate(coreEl!, {
            scale: [1, 1.025],
            duration: 900,
            alternate: true,
            loop: true,
            ease: "inOutQuad",
          }),
        );
        if (scanA.length) track(animate(scanA, { opacity: 0.9, duration: 500 }));
        // Micro energy jitter via createTimer.
        track(
          createTimer({
            frameRate: 24,
            loop: true,
            onUpdate: () => {
              const el = coreEl;
              if (!el) return;
              utils.set(el, {
                translateX: utils.random(-1.4, 1.4),
                translateY: utils.random(-1.4, 1.4),
              });
            },
          }),
        );
        break;
      }

      case "speaking": {
        // Rhythmic radial pulse rings; the core scale + glow are owned by the
        // audio rAF loop (which brightens on peaks), so we don't loop core scale.
        track(
          animate(pulseRings, {
            scale: [1, 2.1],
            opacity: [0.6, 0],
            duration: 1500,
            delay: stagger(420),
            loop: true,
            ease: "out(2)",
          }),
        );
        break;
      }

      case "interrupted": {
        // Quick ripple collapse → single expanding ring + magenta flash → settle.
        const tl = createTimeline();
        if (coreEl) tl.add(coreEl, { scale: [1, 0.86, 1], duration: 600, ease: "out(3)" }, 0);
        if (pulseSingle.length) {
          tl.add(
            pulseSingle,
            { scale: [0.8, 2.2], opacity: [0.9, 0], duration: 750, ease: "out(2)" },
            0,
          );
        }
        track(tl);
        break;
      }

      case "tool_running": {
        // Orbiting nodes structured + faster; HUD ticks light up in sequence.
        track(
          animate(nodes, {
            scale: [1, 1.3],
            duration: 700,
            alternate: true,
            loop: true,
            ease: "inOutQuad",
            delay: stagger(120),
          }),
        );
        track(
          animate(ticks, {
            opacity: [0.2, 0.95],
            duration: 900,
            delay: stagger(22, { from: "first" }),
            alternate: true,
            loop: true,
            ease: "inOutQuad",
          }),
        );
        if (scanA.length) track(animate(scanA, { opacity: 0.85, duration: 500 }));
        track(
          animate(coreEl!, {
            scale: [1, 1.03],
            duration: 1400,
            alternate: true,
            loop: true,
            ease: "inOutSine",
          }),
        );
        break;
      }

      case "error": {
        // Brief fault jolts then recover to a calm baseline.
        const tl = createTimeline();
        if (coreEl) tl.add(coreEl, { scale: [1, 1.12, 0.95, 1.06, 1], opacity: [1, 0.7, 1, 0.8, 1], duration: 900, ease: "inOutQuad" }, 0);
        if (pulseSingle.length) tl.add(pulseSingle, { scale: [0.8, 2], opacity: [0.9, 0], duration: 700, ease: "out(2)" }, 0);
        track(tl);
        break;
      }

      case "sleeping": {
        track(
          animate(coreEl!, {
            scale: [1, 1.01],
            opacity: [0.45, 0.55],
            duration: 6000,
            alternate: true,
            loop: true,
            ease: "inOutSine",
          }),
        );
        track(animate(pulseRings, { opacity: 0, duration: 400 }));
        break;
      }
    }

    // Overall energy/opacity for the whole SVG content per state.
    animate(staticFade, { opacity: st.dim, duration: 600, ease: "out(2)" });

    return () => {
      handles.forEach((h) => h.revert());
      // Reset transient transforms the jitter timer may have left behind.
      const el = q(".hugo-core-group");
      if (el) utils.set(el, { translateX: 0, translateY: 0 });
    };
  }, [state, motionEpoch, motionActive]);

  // ── Audio-reactive rAF loop — runs only while listening/speaking. Reads the
  // latest amplitude from a ref and lerps animatable setters cheaply per frame.
  useEffect(() => {
    if (!motionActive) return;
    if (!AUDIO_STATES.has(state)) return;
    if (reducedRef.current) return;

    let raf = 0;
    let smooth = 0;
    const speaking = state === "speaking";

    const tick = () => {
      const target = utils.clamp(audioRef.current || 0, 0, 1);
      // Speaking has no exposed output amplitude → add a gentle synthesized
      // rhythm so the orb still feels alive; listening uses the raw mic level.
      const driven = speaking
        ? Math.max(target, 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(performance.now() / 140)))
        : target;
      smooth = utils.lerp(smooth, driven, 0.18);

      coreAnimRef.current?.scale(1 + smooth * 0.16);
      glowAnimRef.current?.opacity(0.25 + smooth * 0.6);
      glowAnimRef.current?.scale(0.95 + smooth * 0.25);
      waveAnimRef.current?.scaleY(0.25 + smooth * 1.4);
      waveAnimRef.current?.opacity(0.5 + smooth * 0.5);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      // Ease audio-driven layers back to rest.
      coreAnimRef.current?.scale(1);
      glowAnimRef.current?.opacity(0.0);
      glowAnimRef.current?.scale(1);
      waveAnimRef.current?.scaleY(0.4);
    };
  }, [state, motionEpoch, motionActive]);

  const interactive = !!onClick;

  // The root element type MUST stay stable (always a div). Swapping the root
  // between <button> and <div> when `onClick` toggles makes React tear down and
  // rebuild the entire SVG subtree, orphaning this orb's anime.js scope onto the
  // detached nodes — the scope's looping motion-path animation then calls
  // getPointAtLength on an "inactive document" every frame (an infinite error
  // flood). Interactivity is expressed via role/tabIndex/handlers instead, which
  // change in place without remounting anything. Full keyboard a11y preserved.
  return (
    <div
      ref={rootRef}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? "button" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={style.label}
      className={cn(
        "relative grid place-items-center rounded-full",
        interactive &&
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:ring-hugo-cyan/60",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* 1a. Ambient radial glow (blurred div, behind the svg). */}
      <div
        className="hugo-glow-ambient pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 47%, ${style.color}, transparent 60%)`,
          filter: `blur(${Math.round(size * 0.13)}px)`,
          opacity: style.glow * 0.55,
        }}
      />
      {/* 1b. Audio-reactive glow (blurred div, driven by the rAF loop). */}
      <div
        className="hugo-glow-audio pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${style.color}, transparent 55%)`,
          filter: `blur(${Math.round(size * 0.09)}px)`,
          opacity: 0,
        }}
      />

      <svg
        viewBox="0 0 400 400"
        className="hugo-static-fade relative h-full w-full overflow-visible"
        aria-hidden
        style={{ opacity: style.dim }}
      >
        <defs>
          <radialGradient id="hugo-core-grad" cx="40%" cy="34%" r="68%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="32%" stopColor={style.color} />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <radialGradient id="hugo-liquid-depth" cx="36%" cy="28%" r="76%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
            <stop offset="20%" stopColor="rgba(224,252,255,0.9)" />
            <stop offset="48%" stopColor={style.color} stopOpacity="0.82" />
            <stop offset="72%" stopColor="rgba(7,89,133,0.62)" />
            <stop offset="100%" stopColor="rgba(2,6,23,0.82)" />
          </radialGradient>
          <radialGradient id="hugo-liquid-rim" cx="50%" cy="50%" r="52%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0)" />
            <stop offset="88%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor={style.color} stopOpacity="0.72" />
          </radialGradient>
          <linearGradient id="hugo-liquid-sheen" x1="134" y1="144" x2="270" y2="256" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
            <stop offset="40%" stopColor={style.color} stopOpacity="0.38" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.74)" />
          </linearGradient>
          <linearGradient id="hugo-liquid-blue-ribbon" x1="138" y1="238" x2="272" y2="158" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(14,165,233,0.12)" />
            <stop offset="42%" stopColor={style.color} stopOpacity="0.78" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.75)" />
          </linearGradient>
          <radialGradient id="hugo-core-inner" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="78%" stopColor="rgba(255,255,255,0.0)" />
            <stop offset="100%" stopColor={style.color} stopOpacity="0.5" />
          </radialGradient>
          <clipPath id="hugo-liquid-clip">
            <circle cx={C} cy={C} r={64} />
          </clipPath>
          <filter id="hugo-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <filter id="hugo-liquid-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>
          <filter id="hugo-glass-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="9" stdDeviation="8" floodColor="rgba(0,0,0,0.46)" />
            <feDropShadow dx="-7" dy="-9" stdDeviation="7" floodColor="rgba(255,255,255,0.12)" />
          </filter>
          {/* Hidden waveform morph targets. */}
          <path id="hugo-wave-flat" d={WAVE_FLAT} />
          <path id="hugo-wave-full" d={WAVE_FULL} />
        </defs>

        {/* 2. Outer segmented ring. */}
        <g className="hugo-ring-outer" style={{ transformOrigin: "200px 200px" }}>
          <circle
            className="hugo-color hugo-seg"
            cx={C}
            cy={C}
            r={176}
            fill="none"
            stroke={style.color}
            strokeWidth={2}
            strokeDasharray={SEG_DASH}
            strokeLinecap="round"
          />
        </g>
        {/* 2b. Counter-rotating inner ring. */}
        <g className="hugo-ring-inner" style={{ transformOrigin: "200px 200px" }}>
          <circle
            className="hugo-color hugo-seg"
            cx={C}
            cy={C}
            r={158}
            fill="none"
            stroke={style.color}
            strokeWidth={1.5}
            strokeDasharray="14 10"
            strokeLinecap="round"
            opacity={0.5}
          />
        </g>

        {/* 3. Line-drawn HUD circles + ticks. */}
        <g className="hugo-inner-spin" style={{ transformOrigin: "200px 200px" }}>
          <circle className="hugo-color hugo-draw" cx={C} cy={C} r={132} fill="none" stroke={style.color} strokeWidth={1} opacity={0.6} />
          <circle className="hugo-color hugo-draw" cx={C} cy={C} r={112} fill="none" stroke={style.color} strokeWidth={0.75} opacity={0.45} strokeDasharray="2 6" />
          <circle className="hugo-color hugo-draw" cx={C} cy={C} r={92} fill="none" stroke={style.color} strokeWidth={0.75} opacity={0.4} />
          {TICKS.map((t, i) => (
            <line
              key={i}
              className="hugo-color hugo-tick"
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={style.color}
              strokeWidth={t.major ? 1.6 : 0.8}
              opacity={0.35}
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* 4. Scan arcs. */}
        <g className="hugo-scan-wrap">
          <g className="hugo-scan-a" style={{ transformOrigin: "200px 200px" }}>
            <path className="hugo-color" d={arcPath(146, 0, 70)} fill="none" stroke={style.color} strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
          </g>
          <g className="hugo-scan-b" style={{ transformOrigin: "200px 200px" }}>
            <path className="hugo-color" d={arcPath(120, 180, 50)} fill="none" stroke={style.color} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
          </g>
        </g>

        {/* 5. Orbiting nodes (invisible orbit paths + node circles). */}
        <g>
          <circle className="hugo-orbit-path" cx={C} cy={C} r={150} fill="none" stroke="none" />
          <circle className="hugo-orbit-path" cx={C} cy={C} r={124} fill="none" stroke="none" />
          <circle className="hugo-orbit-path" cx={C} cy={C} r={168} fill="none" stroke="none" />
          <circle className="hugo-orbit-path" cx={C} cy={C} r={136} fill="none" stroke="none" />
          {[0, 1, 2, 3].map((i) => (
            <circle
              key={i}
              className="hugo-node hugo-color-fill"
              r={2.6}
              fill={style.color}
              opacity={0.3}
              filter="url(#hugo-soft)"
            />
          ))}
        </g>

        {/* 8. Radial pulse rings (expand + fade). */}
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            className="hugo-pulse hugo-color"
            cx={C}
            cy={C}
            r={62}
            fill="none"
            stroke={style.color}
            strokeWidth={1.5}
            opacity={0}
            style={{ transformOrigin: "200px 200px" }}
          />
        ))}
        {/* Single-shot ripple ring (interrupted / error). */}
        <circle
          className="hugo-pulse-single hugo-color"
          cx={C}
          cy={C}
          r={62}
          fill="none"
          stroke={style.color}
          strokeWidth={2}
          opacity={0}
          style={{ transformOrigin: "200px 200px" }}
        />

        {/* 6. Core sphere (group is the audio/breathing scale target). */}
        <g className="hugo-core-group" style={{ transformOrigin: "200px 200px" }}>
          <circle cx={C} cy={C} r={64} fill="url(#hugo-liquid-depth)" filter="url(#hugo-glass-shadow)" />
          <g clipPath="url(#hugo-liquid-clip)">
            <g className="hugo-liquid-flow" style={{ transformOrigin: "200px 200px" }}>
              <path
                d="M 132 205 C 154 164 184 147 212 158 C 241 169 261 194 273 230"
                fill="none"
                stroke="url(#hugo-liquid-sheen)"
                strokeWidth={16}
                strokeLinecap="round"
                opacity={0.56}
                filter="url(#hugo-liquid-blur)"
              />
              <path
                d="M 143 235 C 166 210 193 200 218 206 C 241 212 258 229 270 251"
                fill="none"
                stroke="rgba(255,255,255,0.62)"
                strokeWidth={6}
                strokeLinecap="round"
                opacity={0.62}
              />
            </g>
            <g className="hugo-liquid-counterflow" style={{ transformOrigin: "200px 200px" }}>
              <path
                d="M 260 166 C 231 178 210 197 194 220 C 181 239 160 249 137 245"
                fill="none"
                stroke="url(#hugo-liquid-blue-ribbon)"
                strokeWidth={12}
                strokeLinecap="round"
                opacity={0.58}
                filter="url(#hugo-soft)"
              />
              <path
                d="M 153 164 C 180 181 197 196 203 216 C 209 238 225 252 251 258"
                fill="none"
                stroke="rgba(2,132,199,0.62)"
                strokeWidth={7}
                strokeLinecap="round"
                opacity={0.5}
              />
            </g>
            <path
              d="M 151 159 C 172 136 210 128 238 149 C 218 154 203 164 191 181 C 178 176 166 169 151 159 Z"
              fill="rgba(255,255,255,0.5)"
              opacity={0.68}
              filter="url(#hugo-soft)"
            />
            <path
              d="M 222 238 C 238 221 257 217 272 228 C 266 249 250 263 226 270 C 232 257 231 247 222 238 Z"
              fill="rgba(255,255,255,0.42)"
              opacity={0.54}
              filter="url(#hugo-soft)"
            />
          </g>
          <circle cx={C} cy={C} r={64} fill="url(#hugo-liquid-rim)" />
          <circle cx={C} cy={C} r={64} fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth={1.2} opacity={0.7} />
          <circle cx={C} cy={C} r={58} fill="url(#hugo-core-inner)" opacity={0.72} />
          {/* Specular highlights. */}
          <ellipse className="hugo-glass-highlight" cx={181} cy={176} rx={19} ry={12} fill="rgba(255,255,255,0.92)" filter="url(#hugo-soft)" opacity={0.82} />
          <ellipse cx={224} cy={166} rx={18} ry={8} fill="rgba(255,255,255,0.36)" filter="url(#hugo-soft)" opacity={0.55} transform="rotate(28 224 166)" />
          <ellipse cx={234} cy={235} rx={10} ry={23} fill="rgba(255,255,255,0.22)" filter="url(#hugo-soft)" opacity={0.5} transform="rotate(42 234 235)" />

          {/* 7. Waveform ribbon across the core. */}
          <g className="hugo-wave-wrap" style={{ opacity: 0 }}>
            <g className="hugo-wave" style={{ transformOrigin: "200px 200px" }}>
              <path
                className="hugo-wave-path"
                d={WAVE_FLAT}
                fill="none"
                stroke="rgba(255,255,255,0.92)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

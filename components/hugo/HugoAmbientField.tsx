"use client";

import { useEffect, useRef, useState } from "react";
import type { HugoOrbState } from "@/lib/types";
import { fieldStyleFor } from "@/lib/orb/field";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { cn } from "@/lib/utils";

/**
 * HugoAmbientField — the GPU-driven atmosphere the orb lives inside (the
 * "presence behind the glass"). A transparent, full-bleed WebGPU canvas
 * rendered BEHIND the SVG orb via TypeGPU: a slow domain-warped fbm haze plus a
 * soft radial core glow, tinted by the SAME per-state color the orb uses (via
 * lib/orb/field.ts → PALETTE) and swelling with live audio while listening or
 * speaking. Low contrast, mostly felt — atmosphere, not a shader demo.
 *
 * Safety contract:
 *  - Client-only. Canvas markup is deterministic (no random/time/DPR in render),
 *    so SSR and first client paint match; all GPU/matchMedia/DPR reads happen in
 *    effects. typegpu is dynamically imported only after a navigator.gpu check,
 *    so non-WebGPU clients never download it.
 *  - Two-gate fallback: no navigator.gpu OR a failed tgpu.init() falls back to a
 *    pure-CSS tinted gradient that reuses the exact same slot — the orb
 *    composition is unchanged.
 *  - Honors prefers-reduced-motion (a single static frame, no rAF) and pauses
 *    when the tab is hidden or the canvas scrolls off-screen.
 */

export interface HugoAmbientFieldProps {
  state?: HugoOrbState;
  /** Smoothed 0..1 amplitude; swells the field while listening/speaking. */
  audioLevel?: number;
  active?: boolean;
  className?: string;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function HugoAmbientField({
  state = "idle",
  audioLevel,
  active = true,
  className,
}: HugoAmbientFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  // Default to the CSS field: it's what SSR and the first client paint render
  // (deterministic, hydration-safe), and it upgrades to "gpu" after a successful
  // tgpu.init(). A missing navigator.gpu simply leaves it here — no setState in
  // the effect body needed for the unsupported path.
  const [mode, setMode] = useState<"gpu" | "css">("css");

  // Live targets read by the rAF loop without re-rendering.
  const styleRef = useRef(fieldStyleFor(state));
  const audioRef = useRef(0);
  useEffect(() => {
    styleRef.current = fieldStyleFor(state);
  }, [state]);
  useEffect(() => {
    audioRef.current =
      typeof audioLevel === "number" && Number.isFinite(audioLevel) ? audioLevel : 0;
  }, [audioLevel]);

  // ── GPU setup (once). Falls back to CSS on any failure. ──────────────────
  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    // No WebGPU → stay on the default CSS field (no setState needed).
    if (typeof navigator === "undefined" || !navigator.gpu) return;

    let disposed = false;
    let raf = 0;
    let teardown = () => {};

    (async () => {
      try {
        const [{ default: tgpu }, data, common] = await Promise.all([
          import("typegpu"),
          import("typegpu/data"),
          import("typegpu/common"),
        ]);
        if (disposed) return;
        const { f32, vec2f, vec3f, vec4f } = data;

        const root = await tgpu.init();
        if (disposed) {
          root.destroy();
          return;
        }

        const context = root.configureContext({
          canvas,
          alphaMode: "premultiplied",
        });

        // Typed uniforms (TypeGPU-managed buffers), written each frame.
        const uTime = root.createUniform(f32);
        const uRes = root.createUniform(vec2f);
        const uColor = root.createUniform(vec3f);
        const uGlow = root.createUniform(f32);
        const uAudio = root.createUniform(f32);
        const uFlow = root.createUniform(f32);

        // ── WGSL helpers (tagged templates → no build plugin needed). ──
        const hash21 = tgpu.fn([vec2f], f32)`(p) {
          var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
          p3 = p3 + dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }`;
        const vnoise = tgpu.fn([vec2f], f32)`(p) {
          let i = floor(p);
          let f = fract(p);
          let u = f * f * (3.0 - 2.0 * f);
          let a = hash21(i);
          let b = hash21(i + vec2f(1.0, 0.0));
          let c = hash21(i + vec2f(0.0, 1.0));
          let d = hash21(i + vec2f(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }`.$uses({ hash21 });
        const fbm = tgpu.fn([vec2f], f32)`(p) {
          var v = 0.0;
          var amp = 0.5;
          var q = p;
          for (var i = 0; i < 5; i = i + 1) {
            v = v + amp * vnoise(q);
            q = q * 2.02;
            amp = amp * 0.5;
          }
          return v;
        }`.$uses({ vnoise });

        const fragment = tgpu.fragmentFn({ in: { uv: vec2f }, out: vec4f })`{
          let res = uRes;
          let aspect = res.x / max(res.y, 1.0);
          var p = in.uv - vec2f(0.5, 0.5);
          p = vec2f(p.x * aspect, p.y);
          let r = length(p);

          let t = uTime * (0.04 + uFlow * 0.10);

          // domain-warped fbm fog — the slow volumetric haze
          let warp = vec2f(fbm(p * 1.7 + vec2f(t, 0.0)), fbm(p * 1.7 + vec2f(0.0, t)));
          var fog = fbm(p * 2.4 + warp * 0.8 + vec2f(t * 0.6, t * 0.3));
          fog = fog * 0.6 + 0.2;

          // radial falloff: concentrate behind the orb, dissolve fully into the
          // void BEFORE the canvas edge (r ~0.5) so the glow is never hard-cut
          // by the canvas bounds — it fades out on its own.
          let mask = smoothstep(0.5, 0.05, r);

          // soft orb-glow core, expands with audio amplitude
          let glowR = 0.14 + uGlow * 0.10 + uAudio * 0.14;
          let core = exp(-(r * r) / max(glowR * glowR, 0.0001));

          var intensity = (fog * 0.26 * mask + core * (0.45 + uAudio * 0.6)) * uGlow;
          intensity = clamp(intensity * mask, 0.0, 1.2);

          let rgb = uColor * intensity;
          let a = clamp(intensity, 0.0, 1.0);
          return vec4f(rgb, a);
        }`.$uses({ uTime, uRes, uColor, uGlow, uAudio, uFlow, fbm });

        const pipeline = root.createRenderPipeline({
          vertex: common.fullScreenTriangle,
          fragment,
        });

        if (!disposed) {
          setMode("gpu");
        }

        const getDpr = () => Math.min(globalThis.devicePixelRatio ?? 1, 1.5);
        const resize = () => {
          const dpr = getDpr();
          const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
          const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          uRes.write(vec2f(canvas.width, canvas.height));
        };
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);
        window.addEventListener("resize", resize);
        resize();

        // Smoothed shader state so transitions ease like the orb's color tween.
        const sColor: [number, number, number] = [...styleRef.current.color] as [
          number,
          number,
          number,
        ];
        let sGlow = styleRef.current.glow;
        let sFlow = styleRef.current.flow;
        let sAudio = 0;

        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
        let onScreen = true;
        const io = new IntersectionObserver(
          (entries) => {
            onScreen = entries[0]?.isIntersecting ?? true;
            wake();
          },
          { threshold: 0.01 },
        );
        io.observe(canvas);

        const start =
          typeof performance !== "undefined" ? performance.now() : Date.now();

        const renderFrame = (animated: boolean) => {
          const st = styleRef.current;
          const targetAudio = st.audioReactive ? audioRef.current : 0;
          // Ease toward per-state targets every frame (~600ms feel).
          sColor[0] = lerp(sColor[0], st.color[0], 0.05);
          sColor[1] = lerp(sColor[1], st.color[1], 0.05);
          sColor[2] = lerp(sColor[2], st.color[2], 0.05);
          sGlow = lerp(sGlow, st.glow, 0.06);
          sFlow = lerp(sFlow, st.flow, 0.04);
          sAudio = lerp(sAudio, targetAudio, targetAudio > sAudio ? 0.3 : 0.12);

          const now =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          // Frozen time under reduced motion → a static tinted frame.
          uTime.write(animated ? (now - start) / 1000 : 0);
          uRes.write(vec2f(canvas.width, canvas.height));
          uColor.write(vec3f(sColor[0], sColor[1], sColor[2]));
          uGlow.write(sGlow);
          uAudio.write(sAudio);
          uFlow.write(animated ? sFlow : 0);

          pipeline
            .withColorAttachment({
              view: context,
              clearValue: [0, 0, 0, 0],
              loadOp: "clear",
              storeOp: "store",
            })
            .draw(3);
        };

        const shouldAnimate = () =>
          !mql.matches && onScreen && document.visibilityState !== "hidden";

        const loop = () => {
          renderFrame(true);
          if (shouldAnimate()) {
            raf = requestAnimationFrame(loop);
          } else {
            raf = 0;
            // settle one final (static) frame so it doesn't freeze mid-ease
            renderFrame(false);
          }
        };

        function wake() {
          if (disposed) return;
          if (shouldAnimate()) {
            if (raf === 0) raf = requestAnimationFrame(loop);
          } else {
            // paused: hold a single static frame
            if (raf !== 0) {
              cancelAnimationFrame(raf);
              raf = 0;
            }
            renderFrame(false);
          }
        }

        const onVis = () => wake();
        const onMql = () => wake();
        document.addEventListener("visibilitychange", onVis);
        mql.addEventListener("change", onMql);

        wake(); // start (or render a static frame under reduced motion)

        teardown = () => {
          if (raf !== 0) cancelAnimationFrame(raf);
          raf = 0;
          document.removeEventListener("visibilitychange", onVis);
          mql.removeEventListener("change", onMql);
          window.removeEventListener("resize", resize);
          ro.disconnect();
          io.disconnect();
          root.destroy();
        };
      } catch {
        // navigator.gpu present but no usable adapter/device, or a pipeline
        // error — degrade to the CSS field. Never crash the orb.
        if (!disposed) setMode("css");
      }
    })();

    return () => {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      teardown();
    };
  }, [active]);

  // CSS fallback tint follows the same per-state color source as the GPU path.
  const fs = fieldStyleFor(state);
  const rgb = `${Math.round(fs.color[0] * 255)} ${Math.round(fs.color[1] * 255)} ${Math.round(
    fs.color[2] * 255,
  )}`;
  const showCss = mode !== "gpu";

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-700",
          mode === "gpu" ? "opacity-100" : "opacity-0",
        )}
        style={{ mixBlendMode: "screen" }}
      />
      {showCss && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            !reduced && "hugo-field-drift",
          )}
          style={{
            background: `radial-gradient(circle at 50% 46%, rgb(${rgb} / ${0.16 + fs.glow * 0.12}), transparent 62%)`,
            opacity: 0.9,
            mixBlendMode: "screen",
          }}
        />
      )}
    </div>
  );
}

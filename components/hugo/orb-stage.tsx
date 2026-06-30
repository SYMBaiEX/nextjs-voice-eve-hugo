"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { JSAnimation } from "animejs";
import type { HugoOrbState } from "@/lib/types";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/**
 * Persistent app-layer orb (PRD 5.3, uplift).
 *
 * A SINGLE orb lives for the whole app (rendered once by <OrbStageProvider> in
 * the root layout) and travels between pages: each page drops an <OrbSlot> where
 * it wants the orb, and on navigation the fixed orb springs (Anime.js) from its
 * current rect to the new slot's rect — shrinking from the landing hero to the
 * sign-in card, swelling back on the voice console — so it reads as one living
 * presence following the user rather than a fresh element per page.
 *
 * Bonus: because the orb never unmounts, the SVG-motion-path teardown race
 * (getPointAtLength "inactive document") simply cannot happen here.
 *
 * The orb is rendered at BASE_SIZE and transformed to each slot, so the SVG
 * stays crisp even when the landing page asks for a larger hero presence.
 */

const BASE_SIZE = 440;

const LazyHugoOrbStage = dynamic(
  () =>
    import("@/components/hugo/HugoOrbStage").then((mod) => mod.HugoOrbStage),
  { ssr: false },
);

interface SlotRegistration {
  id: string;
  el: HTMLElement;
  state: HugoOrbState;
  audioLevel: number;
  interactive: boolean;
  /** Read lazily at click time so the latest handler is always used. */
  getOnClick: () => (() => void) | undefined;
}

export interface OrbStageApi {
  register: (reg: SlotRegistration) => void;
  update: (
    id: string,
    partial: Partial<Pick<SlotRegistration, "state" | "audioLevel">>,
  ) => void;
  unregister: (id: string) => void;
}

/** Tiny external store: many slots may mount, the most-recently-registered one
 *  that is still mounted is "active". OrbHost subscribes; pages do not. */
class OrbStageStore {
  private slots = new Map<string, SlotRegistration>();
  private order: string[] = [];
  private listeners = new Set<() => void>();
  private everActive = false;
  private version = 0;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getVersion = () => this.version;
  private emit() {
    this.version = (this.version + 1) | 0;
    for (const l of this.listeners) l();
  }

  register = (reg: SlotRegistration) => {
    this.slots.set(reg.id, reg);
    this.everActive = true;
    this.order = this.order.filter((x) => x !== reg.id);
    this.order.push(reg.id);
    this.emit();
  };
  update = (id: string, partial: Partial<SlotRegistration>) => {
    const cur = this.slots.get(id);
    if (!cur) return;
    if (partial.state === cur.state && partial.audioLevel === cur.audioLevel) return;
    this.slots.set(id, { ...cur, ...partial });
    this.emit();
  };
  unregister = (id: string) => {
    if (!this.slots.delete(id)) return;
    this.order = this.order.filter((x) => x !== id);
    this.emit();
  };
  getActive = (): SlotRegistration | null => {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const s = this.slots.get(this.order[i]);
      if (s) return s;
    }
    return null;
  };
  hasEverActive = (): boolean => this.everActive;
}

const OrbApiContext = createContext<OrbStageApi | null>(null);

export function useOrbStage(): OrbStageApi {
  const api = useContext(OrbApiContext);
  if (!api) throw new Error("useOrbStage must be used within <OrbStageProvider>");
  return api;
}

export function OrbStageProvider({ children }: { children: ReactNode }) {
  // Stable singleton store for the app's lifetime.
  const [store] = useState(() => new OrbStageStore());
  const api = useMemo<OrbStageApi>(
    () => ({ register: store.register, update: store.update, unregister: store.unregister }),
    [store],
  );

  return (
    <OrbApiContext.Provider value={api}>
      {children}
      <OrbHost store={store} />
    </OrbApiContext.Provider>
  );
}

interface Transform {
  tx: number;
  ty: number;
  s: number;
}

function OrbHost({ store }: { store: OrbStageStore }) {
  // Re-render whenever the active slot / its state / audio changes.
  useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  const active = store.getActive();
  const reduced = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const stRef = useRef({
    placed: false,
    transform: { tx: 0, ty: 0, s: 1 } as Transform,
    prevId: null as string | null,
    transitioning: false,
    anim: null as JSAnimation | null,
    hideTimer: 0 as ReturnType<typeof setTimeout> | 0,
  });

  // Position the fixed orb over the active slot; spring on slot change, snap on
  // scroll/resize, fade out (after a grace) when no slot is present.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const st = stRef.current;
    let cancelled = false;

    const measure = (el: HTMLElement): Transform => {
      const r = el.getBoundingClientRect();
      return { tx: r.left, ty: r.top, s: r.width / BASE_SIZE };
    };

    const snap = (t: Transform) => {
      container.style.transform = `translate3d(${t.tx}px, ${t.ty}px, 0) scale(${t.s})`;
      container.style.opacity = "1";
      st.transform = t;
    };

    const a = store.getActive();

    if (!a) {
      // No slot right now. Keep the orb exactly where it is (still visible)
      // through navigation gaps, and only fade out if no slot appears for a
      // while — i.e. a genuinely orb-less page. Crucially we do NOT reset
      // `placed`/`prevId`, so when the next slot appears (in either direction,
      // however long the route swap took) the orb SPRINGS to it from here
      // instead of snapping. This is what makes the reverse/any-route
      // transition animate rather than feel like a refresh.
      clearTimeout(st.hideTimer);
      st.hideTimer = setTimeout(() => {
        container.style.opacity = "0";
      }, 600);
      return () => {
        cancelled = true;
        clearTimeout(st.hideTimer);
      };
    }
    clearTimeout(st.hideTimer);

    const target = measure(a.el);
    const idChanged = st.prevId !== a.id;
    st.prevId = a.id;

    st.anim?.revert();
    st.anim = null;

    if (!st.placed || reduced) {
      // First appearance / reduced motion → snap into place and fade in.
      snap(target);
      st.placed = true;
    } else if (idChanged) {
      // Navigated to a new slot → spring the element's transform to the new
      // rect. anime.js reads the element's current transform (set via snap /
      // a prior animation) as the start, so the orb flies from where it is.
      st.transitioning = true;
      container.style.opacity = "1";
      st.transform = target;
      void import("animejs")
        .then(({ animate, spring }) => {
          if (cancelled) return;
          st.anim = animate(container, {
            translateX: target.tx,
            translateY: target.ty,
            scale: target.s,
            ease: spring({ stiffness: 120, damping: 20, mass: 1 }),
            onComplete: () => {
              st.transitioning = false;
            },
          });
        })
        .catch(() => {
          if (cancelled) return;
          st.transitioning = false;
          snap(target);
        });
    } else {
      // Same slot re-measured (its size/pos changed) → snap.
      snap(target);
    }

    // Keep the orb glued to its slot through scroll/resize (no animation).
    let raf = 0;
    const sync = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (st.transitioning) return;
        const cur = store.getActive();
        if (cur) snap(measure(cur.el));
      });
    };
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active?.id, reduced, store]);

  const handleClick = active?.interactive
    ? () => active.getOnClick()?.()
    : undefined;

  return (
    <div
      ref={containerRef}
      className={active?.interactive ? "pointer-events-auto" : "pointer-events-none"}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: BASE_SIZE,
        height: BASE_SIZE,
        transformOrigin: "top left",
        opacity: 0,
        transition: "opacity 0.45s ease",
        zIndex: 30,
        willChange: "transform, opacity",
      }}
    >
      {(active || store.hasEverActive()) && (
        <LazyHugoOrbStage
          state={active?.state ?? "idle"}
          size={BASE_SIZE}
          audioLevel={active?.audioLevel}
          active={!!active}
          onClick={handleClick}
        />
      )}
    </div>
  );
}

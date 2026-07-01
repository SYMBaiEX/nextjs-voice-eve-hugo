"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/**
 * PageTransition — a small fade reveal on section changes, mounted in
 * `app/layout.tsx` around `{children}` only (never `OrbHost`, which lives
 * alongside it as a sibling in `OrbStageProvider` and must keep springing
 * between `<OrbSlot>`s undisturbed by this wrapper).
 *
 * React's `<ViewTransition>` was the obvious first choice for this on
 * Next.js 16, but it's Canary/Experimental-channel-only in React — not
 * available in this project's stable 19.2.7 — so this is a plain
 * Anime.js reveal instead, no experimental APIs.
 *
 * Opacity-only, deliberately no `transform` (no translateY rise): any
 * `transform` on this wrapper would create a new CSS containing block for
 * every `position: fixed` descendant in routed page content — and
 * `AppSidebar`'s mobile/tablet drawer is exactly that (`fixed inset-y-0
 * left-0`), so an animated transform here breaks its positioning app-wide.
 * `opacity` alone doesn't establish a containing block, so it's safe.
 *
 * Watches the top-level route segment (e.g. "chat", "admin"), not the full
 * pathname: `/admin/*` all share one persistent shell
 * (`app/admin/layout.tsx`), so reacting to the full path would replay this
 * animation on every in-section click (`/admin/users` -> `/admin/audit-logs`)
 * instead of only when actually leaving one section for another.
 *
 * Deliberately imperative rather than `key`-ed remount: keying this wrapper
 * by section and letting React unmount/remount `{children}` fought Next's
 * own reconciliation of the routed tree and silently broke client-side
 * navigation (link clicks stopped completing — only a full page load still
 * worked). Re-triggering the fade on the same persistent node/children sidesteps
 * that entirely.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/")[1] || "home";
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const prevSection = useRef(section);

  useEffect(() => {
    if (prevSection.current === section) return;
    prevSection.current = section;
    const el = ref.current;
    if (!el || reduced) return;
    let cancelled = false;
    void import("animejs").then(({ animate }) => {
      if (cancelled) return;
      animate(el, {
        opacity: [0, 1],
        duration: 320,
        ease: "out(3)",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [section, reduced]);

  return <div ref={ref}>{children}</div>;
}

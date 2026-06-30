"use client";

import { useEffect, useRef } from "react";
import {
  AudioLines,
  MessageSquareText,
  Brain,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { animate, stagger, utils } from "animejs";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/**
 * FeatureGrid — the "command surface" feature row for the landing page.
 *
 * Content is static, but the row is a client component so it can layer in two
 * Anime.js touches:
 *   1. A scroll-into-view reveal — cards lift + fade in with an index stagger
 *      the first time the grid enters the viewport (IntersectionObserver gate).
 *   2. A refined hover microinteraction — a subtle scale/lift driven by
 *      animate() on pointer enter/leave (the colored border glow stays in CSS
 *      via the existing `group-hover` ring classes).
 *
 * Under `prefers-reduced-motion` the cards render visible immediately and the
 * hover lift is skipped (the border color still transitions via CSS).
 */

interface Feature {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: "cyan" | "blue" | "magenta" | "muted";
}

const ACCENT: Record<
  Feature["accent"],
  { icon: string; ring: string; chip: string }
> = {
  cyan: {
    icon: "text-hugo-cyan",
    ring: "group-hover:border-hugo-cyan/40",
    chip: "bg-hugo-cyan/10 text-hugo-cyan border-hugo-cyan/20",
  },
  blue: {
    icon: "text-hugo-blue",
    ring: "group-hover:border-hugo-blue/40",
    chip: "bg-hugo-blue/10 text-hugo-blue border-hugo-blue/20",
  },
  magenta: {
    icon: "text-accent-magenta",
    ring: "group-hover:border-accent-magenta/40",
    chip: "bg-accent-magenta/10 text-accent-magenta border-accent-magenta/20",
  },
  muted: {
    icon: "text-text-secondary",
    ring: "group-hover:border-border-strong",
    chip: "bg-surface-elevated text-text-secondary border-border",
  },
};

const FEATURES: Feature[] = [
  {
    label: "VOICE",
    title: "Realtime voice",
    description:
      "Sub-second, full-duplex speech over AI Gateway. Barge-in any time — Hugo stops, listens, and adapts mid-thought.",
    icon: AudioLines,
    accent: "cyan",
  },
  {
    label: "TEXT",
    title: "Chat fallback",
    description:
      "Drop to text in one tap. The same agent, same context — streamed token-by-token when speaking isn't an option.",
    icon: MessageSquareText,
    accent: "blue",
  },
  {
    label: "MEMORY",
    title: "Persistent memory + history",
    description:
      "Conversations, transcripts, and learned preferences persist in Convex and sync live across every device.",
    icon: Brain,
    accent: "magenta",
  },
  {
    label: "OBSERVABILITY",
    title: "Admin observability",
    description:
      "Latency, spend, tool approvals, and session diagnostics surfaced in a live command center for operators.",
    icon: Activity,
    accent: "muted",
  },
];

export function FeatureGrid() {
  const listRef = useRef<HTMLUListElement>(null);
  const reducedMotion = useReducedMotion();

  // Scroll-into-view reveal — runs once when the grid first intersects.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const cards = Array.from(
      list.querySelectorAll<HTMLElement>("[data-feature-card]"),
    );
    if (cards.length === 0) return;

    if (reducedMotion) {
      utils.set(cards, { opacity: 1, y: 0 });
      return;
    }

    // Start hidden; reveal once the row scrolls into view.
    utils.set(cards, { opacity: 0, y: 20 });

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          obs.disconnect();
          animate(cards, {
            opacity: [0, 1],
            y: [20, 0],
            duration: 640,
            ease: "out(3)",
            delay: stagger(90, { from: "center" }),
          });
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(list);
    return () => observer.disconnect();
  }, [reducedMotion]);

  // Hover microinteraction — a subtle lift + scale. Reduced motion opts out.
  function onCardEnter(event: React.PointerEvent<HTMLLIElement>) {
    if (reducedMotion) return;
    animate(event.currentTarget, {
      scale: 1.02,
      y: -4,
      duration: 280,
      ease: "out(3)",
    });
  }

  function onCardLeave(event: React.PointerEvent<HTMLLIElement>) {
    if (reducedMotion) return;
    animate(event.currentTarget, {
      scale: 1,
      y: 0,
      duration: 360,
      ease: "out(2)",
    });
  }

  return (
    <ul
      ref={listRef}
      className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {FEATURES.map((feature) => {
        const accent = ACCENT[feature.accent];
        const Icon = feature.icon;
        return (
          <li
            key={feature.label}
            data-feature-card
            onPointerEnter={onCardEnter}
            onPointerLeave={onCardLeave}
            className={cn(
              "panel group flex flex-col gap-4 p-5 transition-colors duration-300 will-change-transform",
              accent.ring,
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-lg border bg-surface-elevated/60",
                  accent.ring,
                )}
              >
                <Icon className={cn("size-5", accent.icon)} aria-hidden="true" />
              </span>
              <span
                className={cn(
                  "rounded-none border px-2 py-0.5 font-mono text-[10px] tracking-widest",
                  accent.chip,
                )}
              >
                {feature.label}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-medium text-text-primary">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-text-muted">
                {feature.description}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

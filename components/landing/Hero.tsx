"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowRight, Lock, MessageSquareText, Mic } from "lucide-react";
import { createScope, createTimeline, stagger, utils, type Scope } from "animejs";
import { OrbSlot } from "@/components/hugo/OrbSlot";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { api } from "@/convex/_generated/api";

/**
 * Hero — the interactive above-the-fold centerpiece for the landing page.
 *
 * Holds the only client-side behavior on the marketing surface: the orb's
 * onClick navigation and the auth-gated CTAs. Everything else on the page
 * stays a server component. Auth state is resolved via Convex's
 * <Authenticated> / <Unauthenticated> gates so the correct destinations
 * render without a flash of the wrong CTA.
 *
 * Motion: on mount, an Anime.js timeline sequences the entrance — orb,
 * eyebrow, headline (per-word), subcopy, then CTAs reveal with a spring-like
 * `out` ease. The elements are marked with `data-hero-*` hooks and start
 * hidden (opacity:0) via inline style so there is no flash before the
 * sequence runs. Under `prefers-reduced-motion`, everything is set visible
 * instantly with no transforms. The HugoOrb's own animation is untouched —
 * we only reveal its container.
 */


function CtaRow({
  talkHref,
  textHref,
  showSignInHint,
}: {
  talkHref: string;
  textHref: string;
  showSignInHint: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href={talkHref}
          className={cn(
            buttonVariants({ variant: "primary", size: "lg" }),
            "w-full sm:w-auto",
          )}
        >
          <Mic className="size-4" aria-hidden="true" />
          Talk to Hugo
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href={textHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full sm:w-auto",
          )}
        >
          <MessageSquareText className="size-4" aria-hidden="true" />
          Type instead
        </Link>
      </div>
      {showSignInHint ? (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <Lock className="size-3" aria-hidden="true" />
          <span>
            Sign-in required to start a live session.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Split a headline into per-word spans for staggered reveal, preserving
 *  inline accent markup. Words are wrapped in inline-block spans so transforms
 *  apply cleanly; whitespace between them is preserved with explicit spaces. */
function HeadlineWords() {
  return (
    <h1 className="text-balance text-5xl font-semibold tracking-tight text-text-primary sm:text-6xl md:text-7xl">
      <span
        data-hero-word
        className="inline-block will-change-transform"
        style={{ opacity: 0 }}
      >
        Meet
      </span>{" "}
      <span
        data-hero-word
        className="inline-block text-hugo-cyan text-glow will-change-transform"
        style={{ opacity: 0 }}
      >
        Hugo.
      </span>
    </h1>
  );
}

export function Hero({
  initialAuthed = false,
  guestPreviewEnabled = false,
}: {
  /** Auth resolved on the server (app/page.tsx) so first paint is correct. */
  initialAuthed?: boolean;
  /** Public guest-preview setting resolved on the server. */
  guestPreviewEnabled?: boolean;
}) {
  // Guest preview is a runtime admin setting (read via the public settings
  // query), NOT a build-time env var — so toggling it in /admin/settings takes
  // effect without a redeploy. The server-resolved prop is the first-paint value
  // (no flash); the live query takes over once it loads.
  const settings = useQuery(api.settings.getPublic, {});
  const guestPreview =
    settings === undefined ? guestPreviewEnabled : settings?.guestPreviewEnabled === true;
  const guestHref = guestPreview ? "/chat" : "/sign-in?next=/chat";

  // Resolve auth as VALUES (not <Authenticated> wrappers) so the orb and CTAs
  // stay stable across the auth-loading→resolved transition. During the loading
  // window we use the SERVER-resolved value (initialAuthed), so server HTML and
  // the first client paint agree — no CTA flash, no hydration mismatch. (Keeping
  // the orb a single mounted instance also avoids the getPointAtLength
  // "inactive document" remount error.)
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const authed = isLoading ? initialAuthed : isAuthenticated;
  const orbHref = authed ? "/chat" : guestHref;

  const rootRef = useRef<HTMLElement>(null);
  const scopeRef = useRef<Scope | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scope = createScope({ root });
    scopeRef.current = scope;

    scope.add(() => {
      const reveal = utils.$("[data-hero-reveal]");
      const words = utils.$("[data-hero-word]");

      // Reduced motion: no sequencing, no transforms — just make it visible.
      if (reducedMotion) {
        utils.set([...reveal, ...words], { opacity: 1, y: 0, scale: 1 });
        return;
      }

      createTimeline({
        defaults: { ease: "out(3)", duration: 720 },
      })
        // Orb: gentle confidence pop. Reveals the container only — HugoOrb's
        // internal motion keeps running underneath.
        .add("[data-hero-orb]", {
          opacity: [0, 1],
          scale: [0.92, 1],
          duration: 900,
          ease: "out(4)",
        })
        // Eyebrow badge.
        .add(
          "[data-hero-eyebrow]",
          { opacity: [0, 1], y: [10, 0] },
          "-=560",
        )
        // Headline, word by word.
        .add(
          words,
          {
            opacity: [0, 1],
            y: [16, 0],
            delay: stagger(70),
            ease: "out(4)",
          },
          "-=460",
        )
        // Subcopy block.
        .add(
          "[data-hero-copy]",
          { opacity: [0, 1], y: [12, 0] },
          "-=420",
        )
        // CTAs land last with a touch more travel for emphasis.
        .add(
          "[data-hero-cta]",
          { opacity: [0, 1], y: [14, 0], ease: "out(3)" },
          "-=360",
        );
    });

    return () => {
      scope.revert();
      scopeRef.current = null;
    };
  }, [reducedMotion]);

  // Elements start hidden via inline opacity so the timeline can reveal them
  // without a flash. Reduced-motion users get them set visible in the effect
  // on the very next frame.
  const hidden = { opacity: 0 };

  return (
    <section
      ref={rootRef}
      className="relative flex flex-col items-center gap-8 text-center sm:gap-9"
    >
      {/* Orb — a single stable instance; state + destination derive from auth
          values so it never remounts (see note above). */}
      {/* The shared app-layer orb docks here on the landing page. */}
      <div data-hero-orb data-hero-reveal style={hidden}>
        <OrbSlot
          state="idle"
          size="clamp(300px, 24vw, 440px)"
          onClick={() => router.push(orbHref)}
        />
      </div>

      {/* Eyebrow */}
      <div data-hero-eyebrow data-hero-reveal style={hidden}>
        <Badge variant="cyan" className="px-3 py-1">
          <span className="size-1.5 rounded-full bg-hugo-cyan shadow-[0_0_8px_var(--glow)]" />
          REALTIME · VOICE-NATIVE
        </Badge>
      </div>

      {/* Headline + copy */}
      <div className="flex max-w-2xl flex-col items-center gap-5">
        <HeadlineWords />
        <div
          data-hero-copy
          data-hero-reveal
          className="flex flex-col items-center gap-5"
          style={hidden}
        >
          <p className="text-balance text-lg text-text-secondary sm:text-xl">
            A realtime AI voice agent built on the Vercel AI stack.
          </p>
          <p className="max-w-xl text-balance text-sm text-text-muted sm:text-base">
            Speak naturally. Interrupt freely. Continue in chat. Everything syncs
            in real time.
          </p>
        </div>
      </div>

      {/* CTAs — auth-gated. `authed` derives from the server-resolved value
          during the loading window, so this renders the correct destination on
          first paint (no flash) and stays hydration-stable. */}
      <div data-hero-cta data-hero-reveal style={hidden}>
        {authed ? (
          <CtaRow talkHref="/chat" textHref="/chat" showSignInHint={false} />
        ) : (
          <CtaRow
            talkHref={guestHref}
            textHref={guestHref}
            showSignInHint={!guestPreview}
          />
        )}
      </div>
    </section>
  );
}

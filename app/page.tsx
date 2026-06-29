import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { TopNav } from "@/components/layout/TopNav";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/landing/Hero";
import { FeatureGrid } from "@/components/landing/FeatureGrid";

/**
 * Landing / marketing page (PRD 5.2) — the primary showcase surface.
 *
 * Server component by design: the only interactive bits (orb navigation,
 * auth-gated CTAs) live in <Hero>, a small client child. Everything else —
 * ambient background, chrome, feature grid, tech strip — renders on the server.
 *
 * Layout, top to bottom:
 *   1. Fixed ambient grid + radial glow backdrop
 *   2. TopNav
 *   3. Hero (orb, headline, CTAs) — above the fold
 *   4. "Command surface" feature grid
 *   5. Tech strip
 *   6. Footer
 */

const TECH_STACK = [
  "Next.js 16",
  "AI SDK 7",
  "AI Gateway realtime voice",
  "Eve",
  "Convex",
];

export default async function LandingPage() {
  // Resolve auth + the public guest-preview setting on the SERVER so the Hero's
  // CTAs render their correct destination on first paint instead of flashing
  // through the Convex auth-loading window on the client. Both are best-effort:
  // a failure degrades to the unauthenticated/guarded defaults, never an error.
  const token = await convexAuthNextjsToken().catch(() => undefined);
  const [me, settings] = await Promise.all([
    token
      ? fetchQuery(api.users.currentUser, {}, { token }).catch(() => null)
      : Promise.resolve(null),
    fetchQuery(api.settings.getPublic, {}).catch(() => null),
  ]);
  const initialAuthed = me != null;
  const guestPreviewEnabled = settings?.guestPreviewEnabled === true;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      {/* Ambient backdrop — fixed so it never scrolls away */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-60" />
        {/* Primary cyan glow behind the hero */}
        <div
          className="absolute left-1/2 top-[18%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--glow), transparent 65%)",
            filter: "blur(40px)",
          }}
        />
        {/* Cool secondary wash near the fold edge */}
        <div className="absolute -bottom-32 left-1/2 h-[28rem] w-[80rem] -translate-x-1/2 rounded-full bg-hugo-blue/5 blur-3xl" />
        {/* Top fade into the nav */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
      </div>

      <TopNav />

      <main className="flex flex-1 flex-col">
        {/* Hero — above the fold, viewport-first */}
        <section className="relative flex min-h-[88vh] items-center justify-center px-6 pb-20 pt-28">
          <div className="w-full max-w-5xl">
            <Hero
              initialAuthed={initialAuthed}
              guestPreviewEnabled={guestPreviewEnabled}
            />
          </div>
        </section>

        {/* Command surface */}
        <section className="relative px-6 pb-12">
          <div className="mx-auto w-full max-w-6xl">
            <div className="animate-rise mb-8 flex flex-col items-center gap-3 text-center">
              <span className="font-mono text-xs tracking-widest text-hugo-cyan">
                THE COMMAND SURFACE
              </span>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                One agent. Voice, text, memory, and oversight.
              </h2>
              <p className="max-w-2xl text-balance text-sm text-text-secondary">
                Hugo runs as a single coherent system — every modality shares the
                same context, and every session is observable.
              </p>
            </div>
            <FeatureGrid />
          </div>
        </section>

        {/* Tech strip */}
        <section className="relative px-6 py-12">
          <div className="mx-auto w-full max-w-4xl">
            <div className="panel flex flex-col items-center gap-4 px-6 py-5 text-center">
              <span className="font-mono text-[10px] tracking-[0.2em] text-text-muted">
                POWERED BY
              </span>
              <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
                {TECH_STACK.map((tech, i) => (
                  <li key={tech} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-secondary sm:text-sm">
                      {tech}
                    </span>
                    {i < TECH_STACK.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="text-text-muted/50"
                      >
                        ·
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

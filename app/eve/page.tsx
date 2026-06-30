import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { EveChat } from "@/components/eve/EveChat";

export const metadata: Metadata = {
  title: "Hugo Labs (Eve)",
  description:
    "A demo agent running on the Eve durable runtime, shown alongside Hugo.",
};

/**
 * /eve — Hugo Labs: a showcase of the Eve durable-agent runtime, side by side
 * with the in-process Hugo assistant. Auth-gated (the eve runtime at /eve/v1/*
 * is also gated in proxy.ts). The agent itself lives in `agent/` and is served
 * by the co-located eve runtime wired up via `withEve` in next.config.
 */
export default async function EvePage() {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) redirect("/sign-in?next=/eve");

  return (
    <AppShell containerClassName="mx-auto flex h-[calc(100dvh-9rem)] max-w-3xl flex-col">
      <div className="mb-3 flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">
          Hugo Labs
        </h1>
        <p className="text-sm text-text-secondary">
          The same app, two agent stacks: Hugo runs in-process on the AI SDK;
          this runs on the{" "}
          <a
            href="https://eve.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-hugo-cyan hover:underline"
          >
            Eve
          </a>{" "}
          durable runtime.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <EveChat />
      </div>
    </AppShell>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/misc";
import { ChatClient } from "@/app/chat/ChatClient";

export const metadata: Metadata = {
  title: "Console",
  description: "Talk to Hugo by voice or text.",
};

/**
 * /chat — the primary authenticated console (PRD 5.5).
 *
 * Server component: gates on auth before any client work, then renders the
 * <AppShell> + <ChatClient>. The client child reads the active conversation
 * from the URL (?c=ID) via useSearchParams, so it sits inside a Suspense
 * boundary as Next.js requires.
 */
export default async function ChatPage() {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) redirect("/sign-in");

  return (
    <AppShell containerClassName="lg:max-w-none">
      <Suspense fallback={<ChatFallback />}>
        <ChatClient />
      </Suspense>
    </AppShell>
  );
}

function ChatFallback() {
  return (
    <div className="flex w-full gap-6">
      <div className="hidden w-72 shrink-0 lg:block">
        <div className="panel flex flex-col gap-2 p-3">
          <Skeleton className="h-7 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <Skeleton className="h-[32rem] w-full rounded-lg" />
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { ChatShell } from "@/components/chat/ChatShell";

export const metadata: Metadata = {
  title: "Console",
  description: "Talk to Hugo by voice or text.",
};

/**
 * /chat — the primary authenticated console (PRD 5.5).
 *
 * Server component: gates on auth, reads the sidebar-collapse cookie (no flash),
 * then renders the full-viewport <ChatShell>. The shell reads the active
 * conversation from the URL (?c=ID) via useSearchParams, so it sits inside a
 * Suspense boundary as Next.js requires.
 */
export default async function ChatPage() {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) redirect("/sign-in");

  const cookieStore = await cookies();
  const collapsedInitial =
    cookieStore.get("hugo_sidebar")?.value === "collapsed";

  return (
    <Suspense fallback={<div className="h-dvh w-full bg-background" />}>
      <ChatShell collapsedInitial={collapsedInitial} />
    </Suspense>
  );
}

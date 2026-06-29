import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { ConversationsClient } from "@/app/conversations/ConversationsClient";

export const metadata: Metadata = {
  title: "Conversations",
  description: "Your conversation history with Hugo.",
};

/**
 * /conversations — conversation history (PRD 5.7).
 *
 * Server component gating on auth, then the client list (tabs, search,
 * archive/delete) inside the standard <AppShell>.
 */
export default async function ConversationsPage() {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) redirect("/sign-in");

  return (
    <AppShell>
      <ConversationsClient />
    </AppShell>
  );
}

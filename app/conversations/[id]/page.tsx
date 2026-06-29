import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell } from "@/components/layout/AppShell";
import { ConversationDetailClient } from "@/app/conversations/[id]/ConversationDetailClient";

export const metadata: Metadata = {
  title: "Conversation",
  description: "A conversation with Hugo.",
};

/**
 * /conversations/[id] — single conversation view (PRD 5.5, 5.7).
 *
 * Server component: gates on auth, reads the route param, and hands a typed
 * conversation id to the client view. The client handles not-found / no-access
 * (the Convex `get` query returns null in those cases).
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) redirect("/sign-in");

  return (
    <AppShell>
      <ConversationDetailClient conversationId={id as Id<"conversations">} />
    </AppShell>
  );
}

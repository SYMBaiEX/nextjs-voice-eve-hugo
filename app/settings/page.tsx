import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsClient } from "@/app/settings/SettingsClient";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your profile, preferences, usage, and memory.",
};

/**
 * /settings — profile, preferences, usage, and memory (PRD 5.1, 5.9, 5.16).
 *
 * Server component gating on auth, then the client sections inside <AppShell>.
 * The client narrows max width for a comfortable single-column reading layout.
 */
export default async function SettingsPage() {
  const token = await convexAuthNextjsToken();
  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) redirect("/sign-in");

  return (
    <AppShell containerClassName="mx-auto max-w-2xl">
      <SettingsClient />
    </AppShell>
  );
}

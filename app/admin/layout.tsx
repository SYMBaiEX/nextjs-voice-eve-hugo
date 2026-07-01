import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Avatar } from "@/components/ui/misc";
import { AdminNav } from "@/components/admin/AdminNav";
import { OrbSlot } from "@/components/hugo/OrbSlot";

/**
 * Admin chrome + server-side authorization (PRD 5.8 / 5.17).
 *
 * This is the authoritative gate for the entire /admin tree. The middleware
 * proxy may redirect early for UX, but we re-verify here on the server: we read
 * the request's Convex auth token, fetch the current user, and bounce anyone
 * who is not a signed-in admin BEFORE any admin UI renders. Never rely on the
 * client `Authenticated`/`isAdmin` checks alone for this surface. Each Convex
 * admin query/mutation also calls `requireAdmin`, so this is defense-in-depth.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  if (!token) redirect("/sign-in?next=/admin");

  const me = await fetchQuery(api.users.currentUser, {}, { token });
  if (!me) redirect("/sign-in?next=/admin");
  if (me.role !== "admin") redirect("/");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Admin top bar — distinct from the app TopNav, marked with an Admin badge. */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="animate-rise mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge variant="cyan" className="uppercase tracking-wider">
              Admin
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Ambient presence — the orb stays visible outside of chat too,
                instead of only appearing during an active session. */}
            <OrbSlot size={32} className="hidden sm:block" />
            <ThemeToggle />
            <Link
              href="/chat"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Back to app</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* Section nav: static rail on desktop, collapsible on mobile. */}
        <aside className="animate-rise shrink-0 lg:w-56" aria-label="Admin navigation">
          <div className="lg:sticky lg:top-20 lg:space-y-4">
            <AdminNav />
            {me.email ? (
              <div className="mt-3 hidden items-center gap-2 rounded-md border border-border bg-surface/60 px-3 py-2 lg:flex">
                <Avatar name={me.email} className="size-7" />
                <span className="truncate font-mono text-xs text-text-muted">
                  {me.email}
                </span>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { Menu, PanelLeft } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { HugoConsole } from "@/components/hugo/HugoConsole";
import { AppSidebar } from "@/components/chat/AppSidebar";
import { useAuthTransition } from "@/components/providers/ConvexClientProvider";

/**
 * ChatShell — the full-viewport chat experience (PRD 5.5).
 *
 * A collapsible left `AppSidebar` + the Hugo surface filling the rest of the
 * viewport. The active conversation lives in the URL (?c=ID). Sidebar collapse
 * state is seeded from the `hugo_sidebar` cookie (set in this component) so it
 * survives reloads with no flash.
 */
export function ChatShell({ collapsedInitial }: { collapsedInitial: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c") ?? undefined;
  const { canRunProtectedQueries, isAuthenticated, isAuthLoading, isSigningOut } =
    useAuthTransition();

  const [collapsed, setCollapsed] = useState(collapsedInitial);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const createConversation = useMutation(api.conversations.create);

  useEffect(() => {
    if (!isSigningOut && !isAuthLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isAuthenticated, isAuthLoading, isSigningOut, router]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `hugo_sidebar=${next ? "collapsed" : "open"};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  }, []);

  const selectConversation = useCallback(
    (id: string) => {
      router.push(`/chat?c=${id}`);
    },
    [router],
  );

  const handleNew = useCallback(async () => {
    if (creating) return;
    if (!canRunProtectedQueries) {
      router.replace("/sign-in?next=/chat");
      return;
    }
    setCreating(true);
    setMobileOpen(false);
    try {
      const id = await createConversation({ mode: "mixed" });
      router.push(`/chat?c=${id}`);
    } catch {
      toast.error("Couldn’t start a new conversation. Please try again.");
    } finally {
      setCreating(false);
    }
  }, [canRunProtectedQueries, creating, createConversation, router]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <AppSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        creating={creating}
        activeId={activeId}
        onToggleCollapsed={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
        onNew={handleNew}
        onSelect={selectConversation}
      />

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Slim top bar: mobile menu + (desktop) expand toggle when collapsed */}
        <div className="flex h-12 shrink-0 items-center gap-1 px-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open sidebar"
            className="inline-flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary lg:hidden"
          >
            <Menu aria-hidden className="size-4" />
          </button>
          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              className="hidden size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary lg:inline-flex"
            >
              <PanelLeft aria-hidden className="size-4" />
            </button>
          )}
        </div>

        {/* Hugo surface */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 opacity-40" />
          <div className="mx-auto h-full max-w-3xl px-4 pb-4">
            <HugoConsole
              key={activeId ?? "new"}
              conversationId={activeId}
              className="h-full"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

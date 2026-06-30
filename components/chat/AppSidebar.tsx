"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Search,
  Settings,
  SquarePen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { cn, initials } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuthTransition } from "@/components/providers/ConvexClientProvider";
import {
  SidebarHistory,
  type SidebarConversation,
} from "@/components/chat/SidebarHistory";

/**
 * AppSidebar — the collapsible chat sidebar (PRD 5.5).
 *
 * Header (logo + new chat + collapse toggle), a search box, the recency-grouped
 * conversation history, and a footer (settings + theme + user/sign-out). On
 * desktop it collapses to a slim icon rail; on mobile it's an off-canvas drawer
 * driven by `mobileOpen`. Uses the existing `conversations` queries/mutations.
 */
export function AppSidebar({
  collapsed,
  mobileOpen,
  creating,
  activeId,
  onToggleCollapsed,
  onCloseMobile,
  onNew,
  onSelect,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  creating: boolean;
  activeId?: string;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const { canRunProtectedQueries } = useAuthTransition();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const conversations = useQuery(
    api.conversations.list,
    canRunProtectedQueries ? { status: "active", limit: 50 } : "skip",
  );
  const searchResults = useQuery(
    api.conversations.search,
    canRunProtectedQueries && debounced
      ? { queryText: debounced, limit: 30 }
      : "skip",
  );

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      onCloseMobile();
    },
    [onSelect, onCloseMobile],
  );

  const items = (conversations ?? []) as SidebarConversation[];
  const results = debounced
    ? ((searchResults ?? []) as SidebarConversation[])
    : undefined;

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "z-40 flex h-dvh shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur-md",
        // Mobile: off-canvas drawer that slides in. Width is scoped to max-lg so
        // it doesn't conflict with the desktop collapse width at the lg breakpoint.
        "fixed inset-y-0 left-0 max-lg:w-[17rem] transition-transform duration-200 ease-out",
        mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        // Desktop: static, width animates between expanded and icon rail.
        "lg:static lg:translate-x-0 lg:shadow-none lg:transition-[width] lg:duration-200",
        collapsed ? "lg:w-[3.5rem]" : "lg:w-[17rem]",
      )}
      aria-label="Conversations"
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-14 items-center gap-1 px-2",
          collapsed && "lg:justify-center",
        )}
      >
        {!collapsed && (
          <div className="flex-1 pl-1">
            <Logo />
          </div>
        )}
        {/* Desktop collapse toggle */}
        <IconButton
          onClick={onToggleCollapsed}
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:inline-flex"
        >
          {collapsed ? (
            <PanelLeft aria-hidden className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden className="size-4" />
          )}
        </IconButton>
        {/* Mobile close */}
        <IconButton
          onClick={onCloseMobile}
          label="Close sidebar"
          className="lg:hidden"
        >
          <X aria-hidden className="size-4" />
        </IconButton>
      </div>

      {/* New chat */}
      <div className={cn("px-2", collapsed && "lg:flex lg:justify-center")}>
        {collapsed ? (
          <IconButton
            onClick={onNew}
            label="New chat"
            disabled={creating}
            className="hidden lg:inline-flex"
          >
            <SquarePen aria-hidden className="size-4" />
          </IconButton>
        ) : null}
        <button
          type="button"
          onClick={onNew}
          disabled={creating}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors outline-none hover:bg-surface-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/50 disabled:opacity-50",
            collapsed && "lg:hidden",
          )}
        >
          <SquarePen aria-hidden className="size-4" />
          New chat
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-2 pt-2">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              aria-label="Search conversations"
              className="h-9 w-full rounded-lg border border-border bg-surface-elevated/40 pl-8 pr-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus-visible:border-hugo-cyan/40 focus-visible:ring-2 focus-visible:ring-hugo-cyan/20"
            />
          </div>
        </div>
      )}

      {/* History */}
      <div className="scroll-thin mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!collapsed && (
          <SidebarHistory
            items={items}
            searchResults={results}
            searching={!!debounced}
            activeId={activeId}
            onSelect={handleSelect}
          />
        )}
      </div>

      {/* Footer */}
      <div
        className={cn(
          "mt-auto flex flex-col gap-1 border-t border-border p-2",
          collapsed && "lg:items-center",
        )}
      >
        {collapsed ? (
          <>
            <IconLink
              href="/settings"
              label="Settings"
              className="hidden lg:inline-flex"
            >
              <Settings aria-hidden className="size-4" />
            </IconLink>
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
          </>
        ) : (
          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors outline-none hover:bg-surface-elevated hover:text-text-primary focus-visible:bg-surface-elevated focus-visible:text-text-primary"
          >
            <Settings aria-hidden className="size-4 shrink-0 text-text-muted" />
            Settings
          </Link>
        )}
        <SidebarUserNav collapsed={collapsed} />
      </div>
    </aside>
  );
}

/** Footer identity + sign-out (lifted from TopNav's UserMenu, opens upward). */
function SidebarUserNav({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { beginSignOut, canRunProtectedQueries, clearSignOut, isSigningOut } =
    useAuthTransition();
  const me = useQuery(
    api.users.currentUser,
    canRunProtectedQueries ? {} : "skip",
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = me?.name ?? me?.email ?? "Account";

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    setOpen(false);
    beginSignOut();
    try {
      await signOut();
      router.replace("/");
      router.refresh();
    } catch {
      clearSignOut();
      toast.error("Could not sign out. Please try again.");
    }
  }, [beginSignOut, clearSignOut, isSigningOut, router, signOut]);

  const themeRow = useMemo(() => !collapsed, [collapsed]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account menu"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors outline-none hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-hugo-cyan/50",
          collapsed && "lg:justify-center lg:px-0",
        )}
      >
        <Avatar
          name={initials(me?.name, me?.email)}
          src={me?.image}
          className="size-7 shrink-0 text-[11px]"
        />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
            {name}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="panel animate-rise absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-56 overflow-hidden p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-text-primary">
              {me?.name ?? "Signed in"}
            </p>
            {me?.email && (
              <p className="truncate font-mono text-xs text-text-muted">
                {me.email}
              </p>
            )}
          </div>
          {themeRow && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="text-sm text-text-secondary">Theme</span>
              <ThemeToggle />
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
            className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors outline-none hover:bg-error/10 hover:text-error focus-visible:bg-error/10 focus-visible:text-error"
          >
            <LogOut aria-hidden className="size-4 shrink-0" />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-text-muted transition-colors outline-none hover:bg-surface-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/50 disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function IconLink({
  children,
  href,
  label,
  className,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-text-muted transition-colors outline-none hover:bg-surface-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/50",
        className,
      )}
    >
      {children}
    </Link>
  );
}

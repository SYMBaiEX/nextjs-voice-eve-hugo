"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessagesSquare,
  AudioLines,
  Activity,
  Wrench,
  Settings,
  ScrollText,
  BarChart3,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Admin section map. Order mirrors the operator workflow: overview first, then
 * the people/content tables, then usage analytics, then agent internals, then
 * configuration/audit at the bottom.
 */
const ADMIN_LINKS: AdminLink[] = [
  { href: "/admin", label: "overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "users", icon: Users },
  { href: "/admin/conversations", label: "conversations", icon: MessagesSquare },
  { href: "/admin/voice-sessions", label: "voice_sessions", icon: AudioLines },
  { href: "/admin/usage", label: "usage", icon: BarChart3 },
  { href: "/admin/agent-events", label: "agent_events", icon: Activity },
  { href: "/admin/tool-calls", label: "tool_calls", icon: Wrench },
  { href: "/admin/settings", label: "settings", icon: Settings },
  { href: "/admin/audit-logs", label: "audit_logs", icon: ScrollText },
];

/** True when `pathname` is `href` or a child route of it (but `/admin` only matches exactly). */
function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Admin sections">
      {ADMIN_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActiveLink(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-2.5 py-2 font-mono text-xs tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-hugo-cyan/60",
              active
                ? "bg-hugo-cyan/10 text-hugo-cyan"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-hugo-cyan" : "text-text-muted group-hover:text-text-secondary",
              )}
            />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * AdminNav — the admin section sidebar. On large screens it is a static rail; on
 * small screens it collapses behind a menu button that reveals the same list as
 * a panel. The active route is highlighted via `usePathname`.
 */
export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop rail */}
      <div className="hidden lg:block">
        <p className="px-2.5 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
          Console
        </p>
        <NavList pathname={pathname} />
      </div>

      {/* Mobile trigger */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="admin-mobile-nav"
          aria-label={open ? "Close admin menu" : "Open admin menu"}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface-elevated/60 px-3 py-2 font-mono text-xs text-text-secondary outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-hugo-cyan/60"
        >
          <span className="inline-flex items-center gap-2">
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
            admin_sections
          </span>
        </button>
        {open && (
          <div
            id="admin-mobile-nav"
            className="panel animate-rise mt-2 p-1.5"
          >
            <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        )}
      </div>
    </>
  );
}

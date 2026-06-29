"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  LogOut,
  MessageSquare,
  MessagesSquare,
  Settings,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { animate } from "animejs";
import { api } from "@/convex/_generated/api";
import { cn, initials } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Separator } from "@/components/ui/misc";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

interface MenuLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BASE_LINKS: MenuLink[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * UserMenu — a minimal, accessible dropdown built from scratch (button + an
 * absolutely-positioned panel) that closes on outside click and Escape. Shows
 * the user's identity, app links, an admin link when relevant, and sign out.
 */
function UserMenu() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.currentUser);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const name = me?.name ?? me?.email ?? "Account";
  const label = initials(me?.name, me?.email);
  const links = me?.role === "admin"
    ? [...BASE_LINKS, { href: "/admin", label: "Admin", icon: Shield }]
    : BASE_LINKS;

  async function handleSignOut() {
    close();
    try {
      await signOut();
      router.push("/");
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account menu"
        className={cn(
          "flex items-center gap-2 rounded-full border border-border bg-surface-elevated/60 py-1 pl-1 pr-2.5 transition-colors outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-hugo-cyan/60",
          open && "border-border-strong",
        )}
      >
        <Avatar name={label} src={me?.image} className="size-7 text-[11px]" />
        <span className="hidden max-w-[12ch] truncate text-sm text-text-secondary sm:block">
          {name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="panel animate-rise absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 overflow-hidden p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
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
          <Separator className="my-1" />
          <div className="flex flex-col">
            {links.map(({ href, label: linkLabel, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={close}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors outline-none hover:bg-surface-elevated hover:text-text-primary focus-visible:bg-surface-elevated focus-visible:text-text-primary"
              >
                <Icon className="size-4 shrink-0 text-text-muted" />
                {linkLabel}
              </Link>
            ))}
          </div>
          <Separator className="my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors outline-none hover:bg-error/10 hover:text-error focus-visible:bg-error/10 focus-visible:text-error"
          >
            <LogOut className="size-4 shrink-0" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * TopNav — sticky header for the whole app. Logo at left; theme toggle and
 * auth-aware actions at right. Uses Convex's Authenticated / Unauthenticated
 * gates so the correct controls render without a flash.
 *
 * Motion: on mount the header contents gently fade and slide down once. The
 * sticky shell (border + backdrop blur) is left untouched so there's no layout
 * shift; only the inner row animates. Skipped under `prefers-reduced-motion`.
 */
export function TopNav() {
  const rowRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const row = rowRef.current;
    if (!row || reducedMotion) return;

    const anim = animate(row, {
      opacity: [0, 1],
      y: [-8, 0],
      duration: 520,
      ease: "out(3)",
    });

    return () => {
      anim.revert();
    };
  }, [reducedMotion]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div
        ref={rowRef}
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Account and theme">
          <ThemeToggle />
          <Authenticated>
            <UserMenu />
          </Authenticated>
          <Unauthenticated>
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Get started
            </Link>
          </Unauthenticated>
        </nav>
      </div>
    </header>
  );
}

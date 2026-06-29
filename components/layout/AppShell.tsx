"use client";

import { cn } from "@/lib/utils";
import { TopNav } from "@/components/layout/TopNav";

/**
 * AppShell — frame for authenticated app pages. Renders the sticky TopNav and a
 * centered max-width container around the page content. Pages that need a
 * persistent left rail (e.g. conversations) can pass a `sidebar` slot.
 */
export function AppShell({
  children,
  sidebar,
  className,
  containerClassName,
}: {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <div className={cn("flex min-h-dvh flex-col bg-background", className)}>
      <TopNav />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6">
        {sidebar && (
          <aside className="hidden w-64 shrink-0 lg:block" aria-label="Sidebar">
            <div className="sticky top-20">{sidebar}</div>
          </aside>
        )}
        <main className={cn("min-w-0 flex-1", containerClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}

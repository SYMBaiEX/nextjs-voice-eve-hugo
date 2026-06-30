import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

const FOOTER_LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

/**
 * Footer — minimal credit line and a few quiet links. Muted, low-emphasis.
 */
export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full border-t border-border px-4 py-6 sm:px-6",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-text-muted">
          Powered by Next.js 16, AI SDK 7, AI Gateway, Eve, and Convex.
        </p>
        <nav
          className="flex items-center gap-4"
          aria-label={`${APP_NAME} footer`}
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-text-muted transition-colors outline-none hover:text-text-secondary focus-visible:text-text-secondary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

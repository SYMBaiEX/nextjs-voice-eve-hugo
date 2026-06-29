import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

/**
 * Logo — the Hugo wordmark: a small glowing cyan dot beside the name. Links
 * home. Server component (no interactivity). Accepts className for layout.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${APP_NAME} — home`}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-hugo-cyan/60",
        className,
      )}
    >
      <span className="relative grid place-items-center">
        <span
          aria-hidden
          className="absolute size-3 rounded-full bg-hugo-cyan/30 blur-[6px]"
        />
        <span className="relative size-2 rounded-full bg-hugo-cyan shadow-[0_0_10px_2px_var(--glow)]" />
      </span>
      <span className="text-base font-semibold tracking-tight text-text-primary transition-colors group-hover:text-glow">
        {APP_NAME}
      </span>
    </Link>
  );
}

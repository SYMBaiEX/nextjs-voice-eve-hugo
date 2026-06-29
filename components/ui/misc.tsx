import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-elevated", className)}
      style={{ animationDuration: "1.6s" }}
      {...props}
    />
  );
}

export function Separator({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="separator"
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "w-px h-full",
        className,
      )}
    />
  );
}

export function Avatar({
  name,
  src,
  className,
}: {
  name?: string | null;
  src?: string | null;
  className?: string;
}) {
  const letters = (name ?? "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center overflow-hidden rounded-full bg-surface-elevated border border-border text-xs font-medium text-text-secondary",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? "avatar"} className="size-full object-cover" />
      ) : (
        letters
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 rounded-full border-2 border-text-muted/30 border-t-hugo-cyan",
        className,
      )}
      style={{ animation: "hugo-spin 0.7s linear infinite" }}
    />
  );
}

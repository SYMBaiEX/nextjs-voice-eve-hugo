import { cn } from "@/lib/utils";

type MetricAccent = "cyan" | "blue" | "magenta" | "success" | "warning" | "error" | "neutral";

const ACCENT_TEXT: Record<MetricAccent, string> = {
  cyan: "text-hugo-cyan",
  blue: "text-hugo-blue",
  magenta: "text-accent-magenta",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  neutral: "text-text-primary",
};

const ACCENT_ICON_BG: Record<MetricAccent, string> = {
  cyan: "bg-hugo-cyan/10 text-hugo-cyan",
  blue: "bg-hugo-blue/10 text-hugo-blue",
  magenta: "bg-accent-magenta/10 text-accent-magenta",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
  neutral: "bg-surface-elevated text-text-muted",
};

export interface AdminMetricCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: MetricAccent;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

/**
 * AdminMetricCard — a single KPI tile used across the admin console. The value
 * renders large and monospaced (operator-dashboard convention); the label sits
 * above it in muted uppercase, with an optional sub line and accent icon chip.
 * Pure presentational component, safe in server or client trees.
 */
export function AdminMetricCard({
  label,
  value,
  sub,
  accent = "neutral",
  icon: Icon,
  className,
}: AdminMetricCardProps) {
  return (
    <div className={cn("panel flex flex-col gap-3 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {label}
        </span>
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md",
              ACCENT_ICON_BG[accent],
            )}
          >
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums leading-none tracking-tight",
            ACCENT_TEXT[accent],
          )}
        >
          {value}
        </span>
        {sub != null && (
          <span className="font-mono text-xs text-text-secondary">{sub}</span>
        )}
      </div>
    </div>
  );
}

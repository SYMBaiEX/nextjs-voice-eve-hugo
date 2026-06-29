import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium font-mono",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-elevated text-text-secondary",
        cyan: "border-hugo-cyan/30 bg-hugo-cyan/10 text-hugo-cyan",
        blue: "border-hugo-blue/30 bg-hugo-blue/10 text-hugo-blue",
        magenta: "border-accent-magenta/30 bg-accent-magenta/10 text-accent-magenta",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        error: "border-error/30 bg-error/10 text-error",
        muted: "border-border bg-transparent text-text-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };

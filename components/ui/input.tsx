import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-none border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
      "outline-none transition-colors duration-fast ease-hugo focus-visible:border-hugo-cyan/50 focus-visible:ring-2 focus-visible:ring-hugo-cyan/20",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-20 w-full rounded-none border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
      "outline-none transition-colors duration-fast ease-hugo focus-visible:border-hugo-cyan/50 focus-visible:ring-2 focus-visible:ring-hugo-cyan/20",
      "disabled:cursor-not-allowed disabled:opacity-50 resize-none scroll-thin",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-text-secondary", className)}
      {...props}
    />
  );
}

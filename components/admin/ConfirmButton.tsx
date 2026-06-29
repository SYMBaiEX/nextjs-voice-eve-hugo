"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ConfirmButton — a lightweight, inline two-step confirm.
 *
 * First click arms the action (swaps the label to a confirm prompt + an X to
 * cancel); a second click within `timeoutMs` fires `onConfirm`. Avoids a modal
 * for dense admin tables while still preventing accidental destructive actions.
 *
 * Disabled state and pending state are respected; when `pending` the button
 * shows the confirm label and blocks re-entry.
 */
export interface ConfirmButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Resting label. */
  label: React.ReactNode;
  /** Armed label (defaults to "Confirm"). */
  confirmLabel?: React.ReactNode;
  /** Fired on the confirming click. */
  onConfirm: () => void;
  /** Disables auto-disarm; otherwise resets after this many ms. */
  timeoutMs?: number;
  /** External pending flag (e.g. while a mutation runs). */
  pending?: boolean;
  /** Optional tooltip shown via title attr (e.g. "Protected owner"). */
  title?: string;
}

export function ConfirmButton({
  label,
  confirmLabel = "Confirm",
  onConfirm,
  timeoutMs = 4000,
  pending = false,
  disabled,
  variant = "ghost",
  size = "sm",
  className,
  title,
  ...rest
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function disarm() {
    setArmed(false);
    if (timer.current) clearTimeout(timer.current);
  }

  function handleClick() {
    if (pending || disabled) return;
    if (!armed) {
      setArmed(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), timeoutMs);
      return;
    }
    disarm();
    onConfirm();
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant={armed ? "destructive" : variant}
        size={size}
        disabled={disabled || pending}
        title={title}
        aria-label={typeof label === "string" ? label : undefined}
        onClick={handleClick}
        className={cn(className)}
        {...rest}
      >
        {pending ? "Working…" : armed ? confirmLabel : label}
      </Button>
      {armed && !pending && (
        <button
          type="button"
          onClick={disarm}
          aria-label="Cancel"
          className="text-text-muted outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/40 rounded"
        >
          <span className="text-xs font-mono">esc</span>
        </button>
      )}
    </span>
  );
}

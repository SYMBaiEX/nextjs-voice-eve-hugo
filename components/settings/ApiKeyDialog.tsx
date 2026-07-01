"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useExitAnimation } from "@/components/motion/useExitAnimation";

/**
 * ApiKeyDialog — a hand-built modal (overlay + panel) for saving/removing a
 * BYOK secret at a given `/api/<service>-key` route (POST validates+encrypts+
 * stores; DELETE clears). Shared by every BYOK secret Hugo supports (AI
 * Gateway, TinyFish, …) so the add/update/remove flow — and its edge cases —
 * exists in exactly one place.
 *
 * Convex reactivity drives the rest: once the key is saved/removed, the
 * relevant `currentUser.has<Service>Key` flips and any banner/card reflecting
 * it follows automatically, so this component just closes on success.
 */
export interface ApiKeyDialogCopy {
  /** Short service name, e.g. "AI Gateway" / "TinyFish" — used in the title. */
  keyLabel: string;
  /** Why Hugo wants this key, shown under the title. */
  description: string;
  /** The `/api/<service>-key` route this dialog POSTs/DELETEs to. */
  endpoint: string;
  helpUrl: string;
  helpLabel: string;
  placeholder: string;
}

export function ApiKeyDialog({
  open,
  onClose,
  hasKey,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  hasKey: boolean;
  copy: ApiKeyDialogCopy;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Clear the field each time the dialog (re)opens — the "adjust state on prop
  // change" pattern, done during render rather than in an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValue("");
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rendered = useExitAnimation(open, 180);

  const busy = submitting || removing;

  const save = useCallback(async () => {
    const key = value.trim();
    if (!key || busy) return;
    setSubmitting(true);
    try {
      const res = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Couldn’t save your key.");
      }
      toast.success(`${copy.keyLabel} key saved.`);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn’t save your key.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [value, busy, onClose, copy.endpoint, copy.keyLabel]);

  const remove = useCallback(async () => {
    if (busy) return;
    setRemoving(true);
    try {
      const res = await fetch(copy.endpoint, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Couldn’t remove your key.");
      }
      toast.success(`${copy.keyLabel} key removed.`);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn’t remove your key.",
      );
    } finally {
      setRemoving(false);
    }
  }, [busy, onClose, copy.endpoint, copy.keyLabel]);

  if (!rendered) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-base",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "panel relative z-10 w-full max-w-md p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]",
          open ? "animate-rise" : "animate-fall",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-hugo-cyan/30 bg-hugo-cyan/10 text-hugo-cyan">
            <KeyRound aria-hidden className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="api-key-title"
              className="text-base font-semibold text-text-primary"
            >
              {hasKey
                ? `Update your ${copy.keyLabel} key`
                : `Add your ${copy.keyLabel} key`}
            </h2>
            <p className="text-sm text-text-secondary">{copy.description}</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="api-key-input">{copy.keyLabel} key</Label>
            <Input
              id="api-key-input"
              autoFocus
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={copy.placeholder}
              aria-label={`${copy.keyLabel} key`}
              disabled={busy}
            />
            <a
              href={copy.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-xs text-hugo-cyan hover:underline"
            >
              {copy.helpLabel}
              <ExternalLink aria-hidden className="size-3" />
            </a>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            {hasKey ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void remove()}
                disabled={busy}
              >
                {removing && <Spinner />}
                Remove key
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!value.trim() || busy}
              >
                {submitting && <Spinner />}
                {hasKey ? "Update key" : "Save key"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

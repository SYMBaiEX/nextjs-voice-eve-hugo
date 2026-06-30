"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { AI_GATEWAY_KEYS_URL } from "@/lib/constants";

/**
 * GatewayKeyDialog — a hand-built modal (overlay + panel) to add, replace, or
 * remove the caller's own Vercel AI Gateway key (BYOK). Posts the plaintext key
 * to `/api/gateway-key`, which validates it against the gateway, encrypts it,
 * and stores only the ciphertext — the key is never returned or shown again.
 *
 * Convex reactivity drives the rest: once the key is saved/removed,
 * `currentUser.hasGatewayKey` updates and any banner/card reflecting it follows
 * automatically, so this component just closes on success.
 */
export function GatewayKeyDialog({
  open,
  onClose,
  hasKey,
}: {
  open: boolean;
  onClose: () => void;
  hasKey: boolean;
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

  const busy = submitting || removing;

  const save = useCallback(async () => {
    const key = value.trim();
    if (!key || busy) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/gateway-key", {
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
      toast.success("AI Gateway key saved.");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn’t save your key.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [value, busy, onClose]);

  const remove = useCallback(async () => {
    if (busy) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/gateway-key", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Couldn’t remove your key.");
      }
      toast.success("AI Gateway key removed.");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn’t remove your key.",
      );
    } finally {
      setRemoving(false);
    }
  }, [busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gateway-key-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="panel animate-rise relative z-10 w-full max-w-md p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-hugo-cyan/30 bg-hugo-cyan/10 text-hugo-cyan">
            <KeyRound aria-hidden className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="gateway-key-title"
              className="text-base font-semibold text-text-primary"
            >
              {hasKey ? "Update your AI Gateway key" : "Add your AI Gateway key"}
            </h2>
            <p className="text-sm text-text-secondary">
              Hugo uses your own Vercel AI Gateway key so your models, usage, and
              billing stay yours. It’s encrypted at rest and never shown again.
            </p>
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
            <Label htmlFor="gateway-key-input">AI Gateway key</Label>
            <Input
              id="gateway-key-input"
              autoFocus
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="vck_…"
              aria-label="AI Gateway key"
              disabled={busy}
            />
            <a
              href={AI_GATEWAY_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-xs text-hugo-cyan hover:underline"
            >
              Generate a key at vercel.com
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

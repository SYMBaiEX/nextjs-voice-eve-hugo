"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronUp, Cpu, Mic } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  AVAILABLE_REALTIME_MODELS,
  AVAILABLE_TEXT_MODELS,
  type ModelOption,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuthTransition } from "@/components/providers/ConvexClientProvider";

/**
 * ModelMenu — the composer's model selector (chat + realtime voice).
 *
 * Shows the current chat model as a chip and opens an upward menu to pick the
 * chat and voice models, persisted per-user via `users.updatePreferences`. The
 * routes honor the preference (then the admin/global default, then env), so the
 * choice takes effect on the next message / voice session — the foundation for
 * a bring-your-own-key / open-source deployment.
 */
export function ModelMenu() {
  const { canRunProtectedQueries } = useAuthTransition();
  const me = useQuery(
    api.users.currentUser,
    canRunProtectedQueries ? {} : "skip",
  );
  const update = useMutation(api.users.updatePreferences);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The gateway-validated lists (only models this key can actually use); start
  // from the curated constants and refine once /api/models resolves.
  const [textModels, setTextModels] =
    useState<readonly ModelOption[]>(AVAILABLE_TEXT_MODELS);
  const [realtimeModels, setRealtimeModels] = useState<readonly ModelOption[]>(
    AVAILABLE_REALTIME_MODELS,
  );
  useEffect(() => {
    if (!canRunProtectedQueries) return;
    let cancelled = false;
    void fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.text) && data.text.length)
          setTextModels(data.text);
        if (Array.isArray(data.realtime) && data.realtime.length)
          setRealtimeModels(data.realtime);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canRunProtectedQueries]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const textModel =
    me?.preferences?.preferredTextModel ?? textModels[0]?.id ?? "";
  const realtimeModel =
    me?.preferences?.preferredRealtimeModel ?? realtimeModels[0]?.id ?? "";
  const textLabel =
    textModels.find((m) => m.id === textModel)?.label ?? textModel;

  const pick = useCallback(
    async (key: "preferredTextModel" | "preferredRealtimeModel", id: string) => {
      setOpen(false);
      try {
        await update({ preferences: { [key]: id } });
      } catch {
        toast.error("Couldn’t update the model.");
      }
    },
    [update],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Select model"
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-2.5 py-1 text-xs text-text-secondary transition-colors outline-none hover:border-border-strong hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/50",
          open && "border-border-strong text-text-primary",
        )}
      >
        <Cpu aria-hidden className="size-3.5 text-text-muted" />
        <span className="max-w-[16ch] truncate font-mono">{textLabel}</span>
        <ChevronUp
          aria-hidden
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Model selection"
          className="panel animate-rise absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-64 overflow-hidden p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <ModelSection
            icon={<Cpu aria-hidden className="size-3.5" />}
            title="Chat model"
            options={textModels}
            selected={textModel}
            onSelect={(id) => void pick("preferredTextModel", id)}
          />
          <div className="my-1 h-px bg-border" />
          <ModelSection
            icon={<Mic aria-hidden className="size-3.5" />}
            title="Voice model"
            options={realtimeModels}
            selected={realtimeModel}
            onSelect={(id) => void pick("preferredRealtimeModel", id)}
          />
        </div>
      )}
    </div>
  );
}

function ModelSection({
  icon,
  title,
  options,
  selected,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  options: readonly ModelOption[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-2 py-1 text-[0.65rem] font-mono uppercase tracking-wider text-text-muted">
        {icon}
        {title}
      </p>
      {options.map((m) => {
        const active = m.id === selected;
        return (
          <button
            key={m.id}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => onSelect(m.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors outline-none hover:bg-surface-elevated focus-visible:bg-surface-elevated",
              active && "bg-surface-elevated/60",
            )}
          >
            <Check
              aria-hidden
              className={cn(
                "size-3.5 shrink-0",
                active ? "text-hugo-cyan" : "opacity-0",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-primary">
                {m.label}
              </span>
              {m.hint && (
                <span className="block truncate text-[0.65rem] text-text-muted">
                  {m.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

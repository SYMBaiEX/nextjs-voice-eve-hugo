"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronUp, Cpu, Mic, Search } from "lucide-react";
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
 * Shows the current chat model as a chip and opens a searchable menu listing the
 * full model catalog the AI Gateway serves for this key (from /api/models), so a
 * bring-your-own-key deployment can pick any available model. Selections persist
 * per-user via `users.updatePreferences`; the routes honor the preference, then
 * the admin/global default, then env.
 */

function shortLabel(id: string): string {
  return id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
}

export function ModelMenu() {
  const { canRunProtectedQueries } = useAuthTransition();
  const me = useQuery(
    api.users.currentUser,
    canRunProtectedQueries ? {} : "skip",
  );
  const update = useMutation(api.users.updatePreferences);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Full gateway-served lists (+ effective defaults). Start from the curated
  // constants and refine once /api/models resolves.
  const [textModels, setTextModels] =
    useState<readonly ModelOption[]>(AVAILABLE_TEXT_MODELS);
  const [realtimeModels, setRealtimeModels] = useState<readonly ModelOption[]>(
    AVAILABLE_REALTIME_MODELS,
  );
  const [defaults, setDefaults] = useState<{ text: string; realtime: string }>({
    text: AVAILABLE_TEXT_MODELS[0].id,
    realtime: AVAILABLE_REALTIME_MODELS[0].id,
  });

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
        if (data.defaultText || data.defaultRealtime)
          setDefaults({
            text: data.defaultText ?? AVAILABLE_TEXT_MODELS[0].id,
            realtime: data.defaultRealtime ?? AVAILABLE_REALTIME_MODELS[0].id,
          });
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

  const textModel = me?.preferences?.preferredTextModel ?? defaults.text;
  const realtimeModel =
    me?.preferences?.preferredRealtimeModel ?? defaults.realtime;
  const chipLabel =
    textModels.find((m) => m.id === textModel)?.label ?? shortLabel(textModel);

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

  const match = useCallback(
    (m: ModelOption) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.hint ?? "").toLowerCase().includes(q)
      );
    },
    [query],
  );
  const filteredText = useMemo(
    () => textModels.filter(match),
    [textModels, match],
  );
  const filteredRealtime = useMemo(
    () => realtimeModels.filter(match),
    [realtimeModels, match],
  );

  return (
    <div ref={ref} className="relative w-fit">
      {/* Styled as a card tab attached to the top of the composer below it. */}
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Select model"
        className={cn(
          "relative z-10 -mb-px flex items-center gap-1.5 rounded-t-lg border border-b-0 border-border bg-surface-elevated/50 px-3 py-1.5 text-xs text-text-secondary backdrop-blur-sm transition-colors outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/50",
          open && "text-text-primary",
        )}
      >
        <Cpu aria-hidden className="size-3.5 text-text-muted" />
        <span className="max-w-[18ch] truncate font-mono">{chipLabel}</span>
        <ChevronUp
          aria-hidden
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Model selection"
          className="panel animate-rise absolute bottom-[calc(100%+0.5rem)] left-0 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <div className="relative px-1 pb-1.5">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              aria-label="Search models"
              className="h-8 w-full rounded-md border border-border bg-surface-elevated/40 pl-8 pr-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus-visible:border-hugo-cyan/40"
            />
          </div>

          <div className="scroll-thin max-h-72 overflow-y-auto">
            <ModelSection
              icon={<Cpu aria-hidden className="size-3.5" />}
              title="Chat model"
              options={filteredText}
              selected={textModel}
              onSelect={(id) => void pick("preferredTextModel", id)}
            />
            {filteredRealtime.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <ModelSection
                  icon={<Mic aria-hidden className="size-3.5" />}
                  title="Voice model"
                  options={filteredRealtime}
                  selected={realtimeModel}
                  onSelect={(id) => void pick("preferredRealtimeModel", id)}
                />
              </>
            )}
            {filteredText.length === 0 && filteredRealtime.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-text-muted">
                No models match “{query}”.
              </p>
            )}
          </div>
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
  if (options.length === 0) return null;
  return (
    <div>
      <p className="sticky top-0 z-10 flex items-center gap-1.5 bg-surface/95 px-2 py-1 text-[0.65rem] font-mono uppercase tracking-wider text-text-muted backdrop-blur-sm">
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

"use client";

import { cn } from "@/lib/utils";

/**
 * Greeting — the empty-state hero for a fresh conversation.
 *
 * A centered prompt plus a few suggested actions that prefill the composer.
 */

const SUGGESTIONS = [
  "What can you help me with?",
  "Summarize our last conversation",
  "Draft a quick message for me",
  "What are my saved preferences?",
];

export function Greeting({
  onPick,
  className,
}: {
  onPick: (text: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-rise flex w-full max-w-2xl flex-col items-center gap-6 text-center",
        className,
      )}
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
          What can I help with?
        </h1>
        <p className="text-sm text-text-muted">
          Ask a question, talk it through, or pick one to start.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-xl border border-border bg-surface/40 px-4 py-3 text-left text-sm text-text-secondary transition-colors outline-none hover:border-hugo-cyan/30 hover:bg-surface-elevated/50 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

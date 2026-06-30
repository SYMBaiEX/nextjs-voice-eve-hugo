"use client";

import { cn } from "@/lib/utils";

/**
 * SuggestionChips — compact, low-intrusion starter prompts shown just above the
 * composer on a fresh conversation. They prefill the input on click.
 */

const SUGGESTIONS = [
  "What can you help me with?",
  "Summarize our last conversation",
  "Draft a quick message for me",
  "What are my saved preferences?",
];

export function SuggestionChips({
  onPick,
  className,
}: {
  onPick: (text: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-1.5",
        className,
      )}
    >
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-full border border-border/60 bg-surface/30 px-3 py-1.5 text-xs text-text-muted transition-colors outline-none hover:border-hugo-cyan/30 hover:bg-surface-elevated/50 hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-hugo-cyan/40"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";

/**
 * SuggestionChips — compact, low-intrusion starter prompts shown in the composer
 * toolbar (to the right of the model selector) on a fresh conversation. Short
 * labels keep them in one row across the input width; clicking prefills the
 * fuller prompt.
 */

const SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: "Capabilities", prompt: "What can you help me with?" },
  { label: "Summarize", prompt: "Summarize our last conversation" },
  { label: "Draft a message", prompt: "Draft a quick message for me" },
  { label: "My preferences", prompt: "What are my saved preferences?" },
];

export function SuggestionChips({
  onPick,
  className,
}: {
  onPick: (text: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {SUGGESTIONS.map((s) => (
        <button
          key={s.label}
          type="button"
          title={s.prompt}
          onClick={() => onPick(s.prompt)}
          className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-surface/30 px-2 py-1 text-[0.7rem] text-text-muted transition-colors outline-none hover:border-hugo-cyan/30 hover:bg-surface-elevated/50 hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-hugo-cyan/40"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

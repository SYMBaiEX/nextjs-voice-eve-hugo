"use client";

import { useCallback, useState } from "react";
import { AudioLines, MessageSquare } from "lucide-react";
import { HugoVoicePanel } from "@/components/hugo/HugoVoicePanel";
import { HugoChatPanel } from "@/components/hugo/HugoChatPanel";
import { cn } from "@/lib/utils";

/**
 * HugoConsole — the combined voice + text surface (PRD 5.5).
 *
 * The premium framed shell used by the chat page and (for authed users) the
 * landing. A segmented control toggles between Voice (orb hero) and Text modes;
 * voice failures auto-fall back to text. Mode lives in local state and defaults
 * to "voice".
 */

type Mode = "voice" | "text";

export function HugoConsole({
  conversationId,
  className,
}: {
  conversationId?: string;
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>("voice");

  const fallbackToText = useCallback(() => setMode("text"), []);

  return (
    <section
      className={cn(
        "panel relative flex flex-col gap-5 overflow-hidden rounded-lg p-5 sm:p-6",
        className,
      )}
      aria-label="Hugo console"
    >
      {/* Ambient grid backdrop */}
      <div className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 opacity-50" />

      {/* Segmented mode control */}
      <div
        role="tablist"
        aria-label="Conversation mode"
        className="flex w-full max-w-xs self-center rounded-lg border border-border bg-surface/60 p-1"
      >
        <SegmentButton
          active={mode === "voice"}
          onClick={() => setMode("voice")}
          id="hugo-tab-voice"
          controls="hugo-panel-voice"
        >
          <AudioLines aria-hidden className="size-4" />
          Voice
        </SegmentButton>
        <SegmentButton
          active={mode === "text"}
          onClick={() => setMode("text")}
          id="hugo-tab-text"
          controls="hugo-panel-text"
        >
          <MessageSquare aria-hidden className="size-4" />
          Text
        </SegmentButton>
      </div>

      {/* Panels */}
      {mode === "voice" ? (
        <div
          role="tabpanel"
          id="hugo-panel-voice"
          aria-labelledby="hugo-tab-voice"
          className="animate-rise"
        >
          <HugoVoicePanel
            conversationId={conversationId}
            onFallbackToText={fallbackToText}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="hugo-panel-text"
          aria-labelledby="hugo-tab-text"
          className="animate-rise min-h-[24rem]"
        >
          <HugoChatPanel conversationId={conversationId} className="min-h-[24rem]" />
        </div>
      )}
    </section>
  );
}

function SegmentButton({
  active,
  onClick,
  id,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-hugo-cyan/60",
        active
          ? "bg-surface-elevated text-text-primary shadow-[0_0_20px_-8px_var(--hugo-cyan)]"
          : "text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

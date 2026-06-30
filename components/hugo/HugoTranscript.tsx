"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * HugoTranscript — the shared conversation surface (PRD 5.5).
 *
 * Renders both AI SDK v7 `UIMessage[]` (role + parts) and simplified
 * `{ role, content, id }[]` shapes. User turns sit right-aligned and subtle;
 * assistant turns sit left-aligned, prefixed with a small cyan presence dot.
 * Auto-scrolls to the newest content and ships an empty-state hint.
 */

/** A minimal part shape — matches AI SDK's TextUIPart without importing it. */
interface TextLikePart {
  type: string;
  text?: string;
}

/** Either an AI SDK UIMessage-ish object or a simplified message. */
export interface TranscriptMessage {
  id?: string;
  role: "user" | "assistant" | "system" | "tool" | string;
  /** AI SDK UIMessage carries `parts`; simplified messages carry `content`. */
  parts?: readonly TextLikePart[];
  content?: string;
  /** Optional epoch ms for an inline mono timestamp. */
  createdAt?: number;
}

interface NormalizedTurn {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  createdAt?: number;
}

/** Pull display text out of either shape; concatenate text parts for UIMessages. */
function extractText(message: TranscriptMessage): string {
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
  }
  return (message.content ?? "").trim();
}

function normalizeRole(role: string): NormalizedTurn["role"] {
  if (role === "user" || role === "assistant" || role === "system" || role === "tool") {
    return role;
  }
  return "assistant";
}

function formatClock(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function HugoTranscript({
  messages,
  fill = false,
  anchor = "top",
  className,
}: {
  messages: readonly TranscriptMessage[];
  /** Fill the parent (no card chrome / max-height) so a full-viewport surface
   *  can own the scroll + fade. Defaults to the bordered card. */
  fill?: boolean;
  /** "bottom" pins a short conversation to the bottom (near the composer) and
   *  lets it grow upward — used in voice mode so turns hug the input and fade
   *  up behind the hero orb instead of stacking over it. */
  anchor?: "top" | "bottom";
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const turns = useMemo<NormalizedTurn[]>(() => {
    return messages
      .map((m, i) => ({
        id: m.id ?? `turn-${i}`,
        role: normalizeRole(m.role),
        text: extractText(m),
        createdAt: m.createdAt,
      }))
      // Skip empty system/tool placeholders, keep real content only.
      .filter((t) => t.text.length > 0 || t.role === "assistant");
  }, [messages]);

  // Auto-scroll to bottom whenever the rendered content grows/changes.
  const signature = turns.map((t) => `${t.id}:${t.text.length}`).join("|");
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [signature]);

  if (turns.length === 0) {
    if (fill) return null;
    return (
      <div
        className={cn(
          "flex min-h-32 items-center justify-center rounded-lg border border-border bg-surface/40 px-6 py-10 text-center",
          className,
        )}
      >
        <p className="text-sm text-text-muted">Your conversation will appear here.</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "scroll-thin flex flex-col gap-4 overflow-y-auto",
        fill
          ? "h-full"
          : "max-h-[28rem] rounded-lg border border-border bg-surface/40 px-4 py-4",
        className,
      )}
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
    >
      {/* Bottom-anchor: a growable spacer pushes a short conversation down to
          the composer; when history overflows it collapses to 0 and the list
          scrolls normally from the top (avoids the justify-end clipping bug). */}
      {anchor === "bottom" && (
        <div aria-hidden className="min-h-0 flex-1 shrink-0" />
      )}
      {turns.map((turn) => {
        const isUser = turn.role === "user";
        const isAssistant = turn.role === "assistant";
        return (
          <div
            key={turn.id}
            className={cn(
              "flex w-full animate-rise",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "flex max-w-[85%] flex-col gap-1",
                isUser ? "items-end" : "items-start",
              )}
            >
              <div className="flex items-center gap-2">
                {isAssistant && (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-hugo-cyan shadow-[0_0_8px_var(--hugo-cyan)]"
                  />
                )}
                <span className="text-[0.65rem] font-mono uppercase tracking-wider text-text-muted">
                  {isUser ? "You" : isAssistant ? "Hugo" : turn.role}
                </span>
                {turn.createdAt != null && (
                  <span className="text-[0.65rem] font-mono text-text-muted/70">
                    {formatClock(turn.createdAt)}
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
                  isUser
                    ? "border-border bg-surface-elevated/60 text-text-secondary"
                    : "border-hugo-cyan/15 bg-hugo-cyan/[0.04] text-text-primary",
                )}
              >
                {turn.text || (
                  <span className="text-text-muted italic">…</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} aria-hidden className="h-px w-full shrink-0" />
    </div>
  );
}

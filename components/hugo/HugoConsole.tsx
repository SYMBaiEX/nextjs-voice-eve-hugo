"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { AudioLines, MessageSquare } from "lucide-react";
import type { UIMessage } from "ai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { HugoVoicePanel, type PriorTurn } from "@/components/hugo/HugoVoicePanel";
import { HugoChatPanel } from "@/components/hugo/HugoChatPanel";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * HugoConsole — the combined voice + text surface (PRD 5.5).
 *
 * The premium framed shell used by the chat page and (for authed users) the
 * landing. A segmented control toggles between Voice (orb hero) and Text modes;
 * voice failures auto-fall back to text. Mode lives in local state and defaults
 * to "voice".
 *
 * Voice and text share ONE conversation: this component owns the active
 * conversation id (adopting whichever id a panel creates) and loads the shared
 * history once, feeding it to the text panel as `initialMessages` and to the
 * voice panel as `priorTurns`. So voice transcripts load into text chat and the
 * same thread can be continued in either mode (PRD 5.5).
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
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >(conversationId);

  // Adjust the active id when the parent switches conversations (URL ?c=ID),
  // during render — React's "adjust state on prop change" pattern.
  const [prevProp, setPrevProp] = useState(conversationId);
  if (conversationId !== prevProp) {
    setPrevProp(conversationId);
    setActiveConversationId(conversationId);
  }

  const fallbackToText = useCallback(() => setMode("text"), []);
  // Adopt the id a panel creates (a fresh voice or text session), but never
  // override an id we already have — keeps the whole exchange in one thread.
  const adoptConversationId = useCallback((id: string) => {
    setActiveConversationId((prev) => prev ?? id);
  }, []);

  // Shared history (voice turns persisted as modality "audio" + text turns) for
  // the active conversation. Reactive: grows as turns persist.
  const history = useQuery(
    api.messages.list,
    activeConversationId
      ? {
          conversationId: activeConversationId as Id<"conversations">,
          limit: 100,
        }
      : "skip",
  );

  // Seed the text transcript with the full prior exchange (voice + text). The
  // /api/chat route is server-authoritative (rebuilds context from stored
  // history and persists only the new turn), so this is display-only — it never
  // double-persists or double-counts context.
  const initialMessages = useMemo<UIMessage[] | undefined>(() => {
    if (!history) return undefined;
    return history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m._id as string,
        role: m.role as "user" | "assistant",
        parts: [
          { type: "text" as const, text: m.content || m.transcript || "" },
        ],
      }))
      .filter((m) => m.parts[0].text.length > 0) as UIMessage[];
  }, [history]);

  const priorTurns = useMemo<PriorTurn[]>(() => {
    if (!history) return [];
    return history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m._id as string,
        role: m.role as "user" | "assistant",
        content: m.content || m.transcript || "",
        createdAt: m.createdAt,
        sourceId: m.sourceId,
      }))
      .filter((m) => m.content.length > 0);
  }, [history]);

  // Wait for history before mounting the text panel (useChat seeds messages
  // once, at mount), but only when there's actually a conversation to load.
  const historyPending = !!activeConversationId && history === undefined;

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
            conversationId={activeConversationId}
            priorTurns={priorTurns}
            onConversationId={adoptConversationId}
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
          {historyPending ? (
            <div className="flex min-h-[24rem] flex-col gap-3">
              <Skeleton className="h-80 w-full rounded-lg" />
            </div>
          ) : (
            <HugoChatPanel
              // Remount with fresh seeded history when the conversation changes.
              key={activeConversationId ?? "new"}
              conversationId={activeConversationId}
              initialMessages={initialMessages}
              onConversationId={adoptConversationId}
              className="min-h-[24rem]"
            />
          )}
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

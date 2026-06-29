"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { SendHorizontal, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { HugoTranscript, type TranscriptMessage } from "@/components/hugo/HugoTranscript";
import { cn } from "@/lib/utils";

/**
 * HugoChatPanel — the full text chat console (PRD 5.5).
 *
 * Streams against `/api/chat` via AI SDK v7's `useChat` + `DefaultChatTransport`.
 * Owns its textarea input state (Enter to send, Shift+Enter for a newline) and
 * threads `conversationId` through the request body so the server persists turns.
 * Errors surface as toasts; a Stop control halts an in-flight stream.
 */

export function HugoChatPanel({
  conversationId,
  initialMessages,
  className,
}: {
  conversationId?: string;
  initialMessages?: UIMessage[];
  className?: string;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The server creates a conversation on the first turn and returns its id via
  // the `x-conversation-id` header. Capture it and thread it back into every
  // later request so the whole thread persists into ONE conversation instead of
  // fragmenting into one-message stubs.
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >(conversationId);

  // Reset to the new prop when the parent switches conversations — done during
  // render (React's "adjust state on prop change" pattern), not in an effect.
  const [prevProp, setPrevProp] = useState(conversationId);
  if (conversationId !== prevProp) {
    setPrevProp(conversationId);
    setActiveConversationId(conversationId);
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const res = await fetch(input, init);
          const id = res.headers.get("x-conversation-id");
          if (id) setActiveConversationId((prev) => prev ?? id);
          return res;
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop } = useChat({
    transport,
    messages: initialMessages,
    onError: (err) => {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Hugo couldn't respond. Please try again.";
      toast.error(message);
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    void sendMessage({ text }, { body: { conversationId: activeConversationId } });
    // Return focus to the composer for fast back-and-forth.
    textareaRef.current?.focus();
  }, [input, isStreaming, sendMessage, activeConversationId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  // HugoTranscript accepts UIMessage[] directly (role + parts).
  const transcriptMessages = messages as readonly TranscriptMessage[];

  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      <HugoTranscript messages={transcriptMessages} className="flex-1" />

      {/* Streaming indicator */}
      <div className="flex h-5 items-center gap-2 px-1" aria-live="polite">
        {isStreaming && (
          <>
            <Spinner />
            <span className="text-xs font-mono text-text-muted">
              {status === "submitted" ? "Hugo is thinking…" : "Hugo is responding…"}
            </span>
          </>
        )}
        {status === "error" && !isStreaming && (
          <span className="text-xs font-mono text-error">Something went wrong — try again.</span>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 rounded-lg border border-border bg-surface/60 p-2"
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Hugo…"
          aria-label="Message Hugo"
          rows={1}
          className="min-h-10 max-h-40 flex-1 border-0 bg-transparent focus-visible:ring-0 px-2 py-2"
        />
        {isStreaming ? (
          <Button
            type="button"
            variant="subtle"
            size="icon"
            onClick={() => stop()}
            aria-label="Stop generating"
          >
            <Square aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            size="icon"
            disabled={!input.trim()}
            aria-label="Send message"
          >
            <SendHorizontal aria-hidden />
          </Button>
        )}
      </form>
    </div>
  );
}

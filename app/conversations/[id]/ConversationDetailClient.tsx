"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  AudioLines,
  Check,
  Layers,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { HugoChatPanel } from "@/components/hugo/HugoChatPanel";
import {
  HugoTranscript,
  type TranscriptMessage,
} from "@/components/hugo/HugoTranscript";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";

/**
 * ConversationDetailClient — a single conversation (PRD 5.5, 5.7).
 *
 * Shows the stored transcript (Convex Message[] mapped into HugoTranscript),
 * an inline-renameable title, summary + mode, and a "Continue in text" action
 * that reveals a live <HugoChatPanel> bound to this conversation so the user
 * can keep chatting with persistence. Archive/delete and not-found handled.
 */

type ConversationMode = "voice" | "text" | "mixed";

interface ConversationDoc {
  _id: Id<"conversations">;
  title: string;
  mode: ConversationMode;
  status: "active" | "archived" | "deleted";
  summary?: string;
  lastMessageAt: number;
}

interface MessageDoc {
  _id: Id<"messages">;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  transcript?: string;
  createdAt: number;
}

function ModeBadge({ mode }: { mode: ConversationMode }) {
  if (mode === "voice") {
    return (
      <Badge variant="cyan" className="gap-1">
        <AudioLines aria-hidden className="size-3" />
        Voice
      </Badge>
    );
  }
  if (mode === "mixed") {
    return (
      <Badge variant="magenta" className="gap-1">
        <Layers aria-hidden className="size-3" />
        Mixed
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="gap-1">
      <MessageSquare aria-hidden className="size-3" />
      Text
    </Badge>
  );
}

export function ConversationDetailClient({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const router = useRouter();
  const conversation = useQuery(api.conversations.get, { conversationId }) as
    | ConversationDoc
    | null
    | undefined;
  const messages = useQuery(api.messages.list, { conversationId, limit: 500 }) as
    | MessageDoc[]
    | undefined;

  const rename = useMutation(api.conversations.rename);
  const setStatus = useMutation(api.conversations.setStatus);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [continuing, setContinuing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    if (!conversation) return;
    setDraftTitle(conversation.title);
    setEditing(true);
    // Focus after the input mounts.
    requestAnimationFrame(() => inputRef.current?.select());
  }, [conversation]);

  const commitRename = useCallback(async () => {
    const next = draftTitle.trim();
    setEditing(false);
    if (!conversation || !next || next === conversation.title) return;
    try {
      await rename({ conversationId, title: next });
      toast.success("Renamed.");
    } catch {
      toast.error("Couldn't rename the conversation.");
    }
  }, [draftTitle, conversation, rename, conversationId]);

  const handleArchive = useCallback(async () => {
    if (!conversation) return;
    const next = conversation.status === "archived" ? "active" : "archived";
    try {
      await setStatus({ conversationId, status: next });
      toast.success(next === "archived" ? "Archived." : "Restored.");
    } catch {
      toast.error("Couldn't update the conversation.");
    }
  }, [conversation, setStatus, conversationId]);

  const handleDelete = useCallback(async () => {
    if (!conversation) return;
    const ok = window.confirm(
      `Delete "${conversation.title}"? This removes it from your history.`,
    );
    if (!ok) return;
    try {
      await setStatus({ conversationId, status: "deleted" });
      toast.success("Conversation deleted.");
      router.push("/conversations");
    } catch {
      toast.error("Couldn't delete the conversation.");
    }
  }, [conversation, setStatus, conversationId, router]);

  // Map stored Convex messages into the transcript's accepted shape.
  const transcriptMessages = useMemo<TranscriptMessage[]>(() => {
    if (!messages) return [];
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content || m.transcript || "",
        createdAt: m.createdAt,
      }));
  }, [messages]);

  const isLoadingConvo = conversation === undefined;
  const isLoadingMessages = messages === undefined;

  // Not found (or no access): the query returns null.
  if (conversation === null) {
    return (
      <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
        <p className="text-sm text-text-secondary">
          This conversation doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/conversations"
          className="text-sm font-medium text-hugo-cyan outline-none hover:text-hugo-cyan/80 focus-visible:underline"
        >
          Back to conversations
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Back link */}
      <Link
        href="/conversations"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-muted outline-none transition-colors hover:text-text-secondary focus-visible:underline"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All conversations
      </Link>

      {/* Header */}
      <div className="panel flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {isLoadingConvo ? (
              <Skeleton className="h-7 w-1/2" />
            ) : editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void commitRename();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditing(false);
                  }}
                  aria-label="Conversation title"
                  className="h-9 max-w-md"
                />
                <Button type="submit" variant="primary" size="icon" aria-label="Save title">
                  <Check aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cancel rename"
                  onClick={() => setEditing(false)}
                >
                  <X aria-hidden />
                </Button>
              </form>
            ) : (
              <div className="group flex items-center gap-2">
                <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-text-primary">
                  {conversation.title}
                </h1>
                <button
                  type="button"
                  onClick={startEditing}
                  aria-label="Rename conversation"
                  title="Rename"
                  className="shrink-0 rounded-md p-1 text-text-muted opacity-0 transition-opacity outline-none hover:text-text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-hugo-cyan/50 group-hover:opacity-100"
                >
                  <Pencil aria-hidden className="size-4" />
                </button>
              </div>
            )}

            {!isLoadingConvo && (
              <div className="flex flex-wrap items-center gap-2">
                <ModeBadge mode={conversation.mode} />
                {conversation.status === "archived" && (
                  <Badge variant="warning">Archived</Badge>
                )}
                <span className="font-mono text-xs text-text-muted">
                  Updated {timeAgo(conversation.lastMessageAt)}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          {!isLoadingConvo && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  conversation.status === "archived"
                    ? "Restore conversation"
                    : "Archive conversation"
                }
                title={conversation.status === "archived" ? "Restore" : "Archive"}
                onClick={handleArchive}
              >
                {conversation.status === "archived" ? (
                  <ArchiveRestore aria-hidden />
                ) : (
                  <Archive aria-hidden />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete conversation"
                title="Delete"
                className="text-text-muted hover:text-error"
                onClick={handleDelete}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )}
        </div>

        {conversation?.summary ? (
          <p className="rounded-md border border-border bg-surface/40 px-3.5 py-2.5 text-sm text-text-secondary">
            {conversation.summary}
          </p>
        ) : null}
      </div>

      {/* Transcript */}
      <section aria-label="Transcript" className="flex flex-col gap-3">
        <h2 className="px-1 text-xs font-mono uppercase tracking-wider text-text-muted">
          Transcript
        </h2>
        {isLoadingMessages ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface/40 p-4">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
            <Skeleton className="h-12 w-3/5" />
          </div>
        ) : (
          <HugoTranscript messages={transcriptMessages} />
        )}
      </section>

      {/* Continue in text */}
      <section aria-label="Continue in text" className="flex flex-col gap-3">
        {continuing ? (
          <div className="panel animate-rise flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted">
                Continue in text
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContinuing(false)}
              >
                <X aria-hidden /> Close
              </Button>
            </div>
            <HugoChatPanel
              conversationId={conversationId}
              className="min-h-[24rem]"
            />
          </div>
        ) : (
          <Button
            variant="subtle"
            onClick={() => setContinuing(true)}
            className="w-full sm:w-auto"
            disabled={conversation === undefined || conversation.status === "deleted"}
          >
            <MessageSquarePlus aria-hidden /> Continue in text
          </Button>
        )}
      </section>
    </div>
  );
}

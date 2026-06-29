"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  AudioLines,
  Layers,
  MessageSquare,
  MessagesSquare,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";

/**
 * ConversationsClient — conversation history (PRD 5.7).
 *
 * Active/Archived tabs, a debounced client+server search box, and per-row
 * actions (open, archive/restore, delete-with-confirm). Search uses the
 * server `conversations.search` query when a needle is present, otherwise the
 * tab-scoped `conversations.list`.
 */

type ConversationMode = "voice" | "text" | "mixed";
type Tab = "active" | "archived";

interface ConversationRow {
  _id: Id<"conversations">;
  title: string;
  mode: ConversationMode;
  status: "active" | "archived" | "deleted";
  summary?: string;
  lastMessageAt: number;
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

/** Small debounce hook for the search input. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ConversationsClient() {
  const [tab, setTab] = useState<Tab>("active");
  const [rawQuery, setRawQuery] = useState("");
  const query = useDebounced(rawQuery.trim());
  const searching = query.length > 0;

  const listed = useQuery(api.conversations.list, {
    status: tab,
    limit: 100,
  });
  // Only fire the search query when there is a needle ("skip" otherwise).
  const searched = useQuery(
    api.conversations.search,
    searching ? { queryText: query, limit: 50 } : "skip",
  );

  const setStatus = useMutation(api.conversations.setStatus);
  const createConversation = useMutation(api.conversations.create);
  const [creating, setCreating] = useState(false);

  const handleNew = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createConversation({ mode: "mixed" });
      window.location.href = `/chat?c=${id}`;
    } catch {
      toast.error("Couldn't start a new conversation.");
      setCreating(false);
    }
  }, [creating, createConversation]);

  const handleArchive = useCallback(
    async (id: Id<"conversations">, next: "active" | "archived") => {
      try {
        await setStatus({ conversationId: id, status: next });
        toast.success(
          next === "archived" ? "Conversation archived." : "Conversation restored.",
        );
      } catch {
        toast.error("Couldn't update the conversation.");
      }
    },
    [setStatus],
  );

  const handleDelete = useCallback(
    async (id: Id<"conversations">, title: string) => {
      const ok = window.confirm(
        `Delete "${title}"? This removes it from your history.`,
      );
      if (!ok) return;
      try {
        await setStatus({ conversationId: id, status: "deleted" });
        toast.success("Conversation deleted.");
      } catch {
        toast.error("Couldn't delete the conversation.");
      }
    },
    [setStatus],
  );

  // When searching, results span both active+archived; scope to the chosen tab.
  const rows = useMemo<ConversationRow[] | undefined>(() => {
    const source = searching ? searched : listed;
    if (source === undefined) return undefined;
    const data = source as ConversationRow[];
    return searching ? data.filter((c) => c.status === tab) : data;
  }, [searching, searched, listed, tab]);

  const isLoading = rows === undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">
            Conversations
          </h1>
          <p className="text-sm text-text-secondary">
            Everything you&apos;ve discussed with Hugo, in one place.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleNew} disabled={creating}>
          <Plus aria-hidden /> New conversation
        </Button>
      </div>

      {/* Controls: tabs + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Conversation status"
          className="flex w-full max-w-xs rounded-lg border border-border bg-surface/60 p-1"
        >
          <TabButton active={tab === "active"} onClick={() => setTab("active")}>
            Active
          </TabButton>
          <TabButton active={tab === "archived"} onClick={() => setTab("archived")}>
            Archived
          </TabButton>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="pl-9"
          />
        </div>
      </div>

      {/* List */}
      <div className="panel overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState searching={searching} tab={tab} onNew={handleNew} creating={creating} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((c) => (
              <li
                key={c._id}
                className="group flex flex-col gap-3 p-4 transition-colors hover:bg-surface-elevated/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  href={`/conversations/${c._id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1 outline-none focus-visible:underline"
                >
                  <span className="flex items-center gap-2">
                    <span className="line-clamp-1 text-sm font-medium text-text-primary">
                      {c.title}
                    </span>
                    <ModeBadge mode={c.mode} />
                  </span>
                  {c.summary ? (
                    <span className="line-clamp-1 text-xs text-text-muted">
                      {c.summary}
                    </span>
                  ) : null}
                  <span className="font-mono text-[0.65rem] text-text-muted">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </Link>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Link
                    href={`/conversations/${c._id}`}
                    className="text-xs font-medium text-hugo-cyan outline-none transition-colors hover:text-hugo-cyan/80 focus-visible:underline"
                  >
                    Open
                  </Link>
                  {c.status === "archived" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Restore conversation"
                      title="Restore"
                      onClick={() => handleArchive(c._id, "active")}
                    >
                      <ArchiveRestore aria-hidden />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Archive conversation"
                      title="Archive"
                      onClick={() => handleArchive(c._id, "archived")}
                    >
                      <Archive aria-hidden />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete conversation"
                    title="Delete"
                    className="text-text-muted hover:text-error"
                    onClick={() => handleDelete(c._id, c.title)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-hugo-cyan/60",
        active
          ? "bg-surface-elevated text-text-primary"
          : "text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  searching,
  tab,
  onNew,
  creating,
}: {
  searching: boolean;
  tab: Tab;
  onNew: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-elevated/60">
        <MessagesSquare aria-hidden className="size-6 text-text-muted" />
      </span>
      {searching ? (
        <p className="max-w-sm text-sm text-text-muted">
          No conversations match your search.
        </p>
      ) : tab === "archived" ? (
        <p className="max-w-sm text-sm text-text-muted">
          Nothing archived yet. Archived conversations live here.
        </p>
      ) : (
        <>
          <p className="max-w-sm text-sm text-text-muted">
            You haven&apos;t started any conversations yet.
          </p>
          <Button variant="subtle" size="sm" onClick={onNew} disabled={creating}>
            <Plus aria-hidden /> Start your first one
          </Button>
        </>
      )}
    </div>
  );
}

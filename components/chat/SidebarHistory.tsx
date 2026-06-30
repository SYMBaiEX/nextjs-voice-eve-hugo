"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * SidebarHistory — the conversation list for the chat sidebar.
 *
 * Renders conversations grouped by recency (Today / Yesterday / Previous 7 days
 * / Older). Each row selects on click and exposes a ⋯ menu to rename (inline)
 * or delete (soft, with an Undo toast). When searching, the parent passes a flat
 * `searchResults` list and we render a single "Results" group instead.
 */

export interface SidebarConversation {
  _id: Id<"conversations">;
  title: string;
  mode: "voice" | "text" | "mixed";
  lastMessageAt: number;
}

type Group = { label: string; items: SidebarConversation[] };

function groupByRecency(items: readonly SidebarConversation[]): Group[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const yesterday = today - 86_400_000;
  const lastWeek = today - 7 * 86_400_000;

  const buckets: Record<string, SidebarConversation[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };
  for (const c of items) {
    if (c.lastMessageAt >= today) buckets.Today.push(c);
    else if (c.lastMessageAt >= yesterday) buckets.Yesterday.push(c);
    else if (c.lastMessageAt >= lastWeek) buckets["Previous 7 days"].push(c);
    else buckets.Older.push(c);
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }));
}

export function SidebarHistory({
  items,
  searchResults,
  searching,
  activeId,
  onSelect,
}: {
  items: readonly SidebarConversation[];
  /** When defined, render these flat (search mode) instead of grouped history. */
  searchResults?: readonly SidebarConversation[];
  searching: boolean;
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo<Group[]>(() => {
    if (searchResults !== undefined) {
      return searchResults.length
        ? [{ label: "Results", items: [...searchResults] }]
        : [];
    }
    return groupByRecency(items);
  }, [items, searchResults]);

  if (groups.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-text-muted">
        {searching
          ? "No conversations match your search."
          : "No conversations yet. Start talking and they’ll show up here."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 text-[0.65rem] font-mono uppercase tracking-wider text-text-muted/80">
            {group.label}
          </p>
          {group.items.map((c) => (
            <ConversationRow
              key={c._id}
              conversation={c}
              active={c._id === activeId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: SidebarConversation;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const rename = useMutation(api.conversations.rename);
  const setStatus = useMutation(api.conversations.setStatus);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close the ⋯ menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!rowRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const startRename = useCallback(() => {
    setMenuOpen(false);
    setDraft(conversation.title);
    setEditing(true);
    // focus after the input mounts
    requestAnimationFrame(() => inputRef.current?.select());
  }, [conversation.title]);

  const commitRename = useCallback(async () => {
    const title = draft.trim();
    setEditing(false);
    if (!title || title === conversation.title) return;
    try {
      await rename({ conversationId: conversation._id, title });
    } catch {
      toast.error("Couldn’t rename the conversation.");
    }
  }, [draft, conversation._id, conversation.title, rename]);

  const handleDelete = useCallback(async () => {
    setMenuOpen(false);
    try {
      await setStatus({ conversationId: conversation._id, status: "deleted" });
      toast.success("Conversation deleted", {
        action: {
          label: "Undo",
          onClick: () => {
            void setStatus({
              conversationId: conversation._id,
              status: "active",
            });
          },
        },
      });
    } catch {
      toast.error("Couldn’t delete the conversation.");
    }
  }, [conversation._id, setStatus]);

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void commitRename();
        }}
        className="px-1"
      >
        <input
          ref={inputRef}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Rename conversation"
          className="w-full rounded-md border border-hugo-cyan/40 bg-surface-elevated px-2.5 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-hugo-cyan/40"
        />
      </form>
    );
  }

  return (
    <div ref={rowRef} className="group/row relative">
      <button
        type="button"
        onClick={() => onSelect(conversation._id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-hugo-cyan/50",
          active
            ? "border-hugo-cyan/30 bg-hugo-cyan/[0.06] text-text-primary"
            : "border-transparent text-text-secondary hover:border-border hover:bg-surface-elevated/50 hover:text-text-primary",
        )}
      >
        <span className="line-clamp-1 flex-1">{conversation.title}</span>
      </button>

      {/* ⋯ trigger — appears on hover/focus or when its menu is open */}
      <button
        type="button"
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition-colors outline-none hover:bg-surface-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-hugo-cyan/50",
          menuOpen
            ? "opacity-100"
            : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
        )}
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Conversation options"
          className="panel animate-rise absolute right-1 top-[calc(100%-0.25rem)] z-50 w-40 overflow-hidden p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={startRename}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors outline-none hover:bg-surface-elevated hover:text-text-primary focus-visible:bg-surface-elevated focus-visible:text-text-primary"
          >
            <Pencil aria-hidden className="size-4 shrink-0 text-text-muted" />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleDelete()}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary transition-colors outline-none hover:bg-error/10 hover:text-error focus-visible:bg-error/10 focus-visible:text-error"
          >
            <Trash2 aria-hidden className="size-4 shrink-0" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

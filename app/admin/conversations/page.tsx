"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Archive, Flag, MessageSquare, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import {
  HugoTranscript,
  type TranscriptMessage,
} from "@/components/hugo/HugoTranscript";
import { cn, timeAgo } from "@/lib/utils";

type Mode = "voice" | "text" | "mixed";
type Status = "active" | "archived" | "deleted";

type ConversationRow = {
  _id: Id<"conversations">;
  userId: Id<"users">;
  title: string;
  mode: Mode;
  status: Status;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  summary?: string;
  tags?: string[];
  ownerEmail: string | null;
};

type MessageRow = {
  _id: Id<"messages">;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  transcript?: string;
  createdAt: number;
};

const MODE_BADGE: Record<Mode, BadgeProps["variant"]> = {
  voice: "magenta",
  text: "blue",
  mixed: "cyan",
};

const STATUS_BADGE: Record<Status, BadgeProps["variant"]> = {
  active: "success",
  archived: "warning",
  deleted: "error",
};

const MODE_FILTERS: (Mode | "all")[] = ["all", "voice", "text", "mixed"];
const STATUS_FILTERS: (Status | "all")[] = [
  "all",
  "active",
  "archived",
  "deleted",
];

const COLSPAN = 7;

export default function AdminConversationsPage() {
  const [mode, setMode] = useState<Mode | "all">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [openId, setOpenId] = useState<Id<"conversations"> | null>(null);

  const conversations = useQuery(api.conversations.listForAdmin, {
    mode: mode === "all" ? undefined : mode,
    status: status === "all" ? undefined : status,
  }) as ConversationRow[] | undefined;

  const flag = useMutation(api.conversations.flagForAdmin);
  const setStatusFn = useMutation(api.conversations.setStatusForAdmin);
  const [pendingId, setPendingId] = useState<Id<"conversations"> | null>(null);

  const openConversation = useMemo(
    () => conversations?.find((c) => c._id === openId) ?? null,
    [conversations, openId],
  );

  async function handleFlag(row: ConversationRow) {
    setPendingId(row._id);
    try {
      await flag({ conversationId: row._id });
      toast.success(`Flagged “${row.title}” for review`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to flag");
    } finally {
      setPendingId(null);
    }
  }

  async function handleSetStatus(
    row: ConversationRow,
    next: "archived" | "deleted",
  ) {
    setPendingId(row._id);
    try {
      await setStatusFn({ conversationId: row._id, status: next });
      toast.success(
        next === "archived"
          ? `Archived “${row.title}”`
          : `Deleted “${row.title}”`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setPendingId(null);
    }
  }

  const total = conversations?.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-text-primary">
            Conversations
          </h1>
          <span className="font-mono text-xs text-text-muted">
            {conversations === undefined ? "—" : `${total} shown`}
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          Inspect, flag, and moderate conversations across all users.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <FilterGroup
          label="Mode"
          options={MODE_FILTERS}
          value={mode}
          onChange={setMode}
        />
        <FilterGroup
          label="Status"
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
        />
      </div>

      <div className="panel overflow-hidden p-0">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Title</TH>
              <TH>Owner</TH>
              <TH>Mode</TH>
              <TH>Status</TH>
              <TH>Last msg</TH>
              <TH>Summary</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {conversations === undefined &&
              Array.from({ length: 6 }).map((_, i) => (
                <TR key={`s-${i}`} className="hover:bg-transparent">
                  <TD colSpan={COLSPAN}>
                    <Skeleton className="h-5 w-full" />
                  </TD>
                </TR>
              ))}

            {conversations !== undefined && total === 0 && (
              <TR className="hover:bg-transparent">
                <TD colSpan={COLSPAN} className="py-10 text-center text-text-muted">
                  No conversations match these filters.
                </TD>
              </TR>
            )}

            {conversations?.map((c) => {
              const flagged = c.tags?.includes("flagged");
              const isPending = pendingId === c._id;
              return (
                <TR
                  key={c._id}
                  onClick={() => setOpenId(c._id)}
                  className={cn(
                    "cursor-pointer",
                    openId === c._id && "bg-surface-elevated/60",
                  )}
                >
                  <TD className="max-w-[16rem]">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-text-primary">
                        {c.title || "Untitled"}
                      </span>
                      {flagged && (
                        <Badge variant="warning" className="shrink-0">
                          <Flag className="size-3" /> flagged
                        </Badge>
                      )}
                    </div>
                  </TD>
                  <TD className="max-w-[14rem] truncate font-mono text-xs">
                    {c.ownerEmail ?? <span className="text-text-muted">—</span>}
                  </TD>
                  <TD>
                    <Badge variant={MODE_BADGE[c.mode]}>{c.mode}</Badge>
                  </TD>
                  <TD>
                    <Badge variant={STATUS_BADGE[c.status]}>{c.status}</Badge>
                  </TD>
                  <TD className="font-mono text-xs text-text-muted">
                    {timeAgo(c.lastMessageAt)}
                  </TD>
                  <TD className="max-w-[18rem] truncate text-xs text-text-muted">
                    {c.summary ?? "—"}
                  </TD>
                  <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {isPending && <Spinner className="mr-1" />}
                      <ConfirmButton
                        label={
                          <>
                            <Flag /> Flag
                          </>
                        }
                        confirmLabel="Flag?"
                        variant="ghost"
                        onConfirm={() => handleFlag(c)}
                        pending={isPending}
                        disabled={flagged}
                        title={flagged ? "Already flagged" : undefined}
                      />
                      <ConfirmButton
                        label={
                          <>
                            <Archive /> Archive
                          </>
                        }
                        confirmLabel="Archive?"
                        variant="ghost"
                        onConfirm={() => handleSetStatus(c, "archived")}
                        pending={isPending}
                        disabled={c.status === "archived"}
                      />
                      <ConfirmButton
                        label={
                          <>
                            <Trash2 /> Delete
                          </>
                        }
                        confirmLabel="Delete?"
                        variant="ghost"
                        onConfirm={() => handleSetStatus(c, "deleted")}
                        pending={isPending}
                        disabled={c.status === "deleted"}
                      />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      {openConversation && (
        <TranscriptDrawer
          conversation={openConversation}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated/40 p-1">
        {options.map((opt) => (
          <Button
            key={opt}
            size="sm"
            variant={value === opt ? "subtle" : "ghost"}
            onClick={() => onChange(opt)}
            className={cn(
              "h-7 px-2.5 text-xs capitalize",
              value === opt && "text-text-primary",
            )}
          >
            {opt}
          </Button>
        ))}
      </div>
    </div>
  );
}

function TranscriptDrawer({
  conversation,
  onClose,
}: {
  conversation: ConversationRow;
  onClose: () => void;
}) {
  const messages = useQuery(api.messages.listForAdmin, {
    conversationId: conversation._id,
  }) as MessageRow[] | undefined;

  const transcriptMessages: TranscriptMessage[] = useMemo(
    () =>
      (messages ?? []).map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content || m.transcript || "",
        createdAt: m.createdAt,
      })),
    [messages],
  );

  return (
    <aside
      className="panel flex flex-col gap-4 p-5 animate-rise"
      aria-label={`Transcript for ${conversation.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare aria-hidden className="size-4 text-hugo-cyan" />
            <p className="truncate text-sm font-medium text-text-primary">
              {conversation.title || "Untitled"}
            </p>
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
            {conversation.ownerEmail ?? "unknown"} · {conversation.mode} ·{" "}
            {messages === undefined ? "—" : `${messages.length} messages`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close transcript"
        >
          <X />
        </Button>
      </div>

      {conversation.summary && (
        <p className="rounded-md border border-border bg-surface-elevated/40 px-3 py-2 text-xs text-text-secondary">
          {conversation.summary}
        </p>
      )}

      {messages === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <HugoTranscript messages={transcriptMessages} />
      )}
    </aside>
  );
}

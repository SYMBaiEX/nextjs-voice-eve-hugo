"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Plus, MessageSquarePlus, AudioLines, MessageSquare, Layers } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { HugoConsole } from "@/components/hugo/HugoConsole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import { useAuthTransition } from "@/components/providers/ConvexClientProvider";

/**
 * ChatClient — the primary authenticated console (PRD 5.5).
 *
 * Left rail lists the user's recent active conversations and a "New" action;
 * the main area renders <HugoConsole> bound to the active conversation. The
 * active id lives in the URL (?c=ID) so it survives reloads and is shareable.
 */

type ConversationMode = "voice" | "text" | "mixed";

function ModeBadge({ mode }: { mode: ConversationMode }) {
  if (mode === "voice") {
    return (
      <Badge variant="cyan" className="gap-1 px-1.5 py-0">
        <AudioLines aria-hidden className="size-3" />
        Voice
      </Badge>
    );
  }
  if (mode === "mixed") {
    return (
      <Badge variant="magenta" className="gap-1 px-1.5 py-0">
        <Layers aria-hidden className="size-3" />
        Mixed
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="gap-1 px-1.5 py-0">
      <MessageSquare aria-hidden className="size-3" />
      Text
    </Badge>
  );
}

export function ChatClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    canRunProtectedQueries,
    isAuthenticated,
    isAuthLoading,
    isSigningOut,
  } = useAuthTransition();
  const activeId = searchParams.get("c") ?? undefined;

  useEffect(() => {
    if (!isSigningOut && !isAuthLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isAuthenticated, isAuthLoading, isSigningOut, router]);

  const conversations = useQuery(
    api.conversations.list,
    canRunProtectedQueries
      ? {
          status: "active",
          limit: 30,
        }
      : "skip",
  );
  const createConversation = useMutation(api.conversations.create);
  const [creating, setCreating] = useState(false);

  const selectConversation = useCallback(
    (id: string) => {
      router.push(`/chat?c=${id}`);
    },
    [router],
  );

  const handleNew = useCallback(async () => {
    if (creating) return;
    if (!canRunProtectedQueries) {
      router.replace("/sign-in?next=/chat");
      return;
    }
    setCreating(true);
    try {
      const id = await createConversation({ mode: "mixed" });
      router.push(`/chat?c=${id}`);
    } catch {
      toast.error("Couldn't start a new conversation. Please try again.");
    } finally {
      setCreating(false);
    }
  }, [canRunProtectedQueries, creating, createConversation, router]);

  const isLoading = isAuthLoading || conversations === undefined;

  if (isSigningOut || (!isAuthLoading && !isAuthenticated)) {
    return (
      <div className="panel flex min-h-[24rem] items-center justify-center p-6 text-sm text-text-secondary">
        {isSigningOut ? "Signing out..." : "Redirecting to sign in..."}
      </div>
    );
  }

  return (
    <div className="flex w-full gap-6">
      {/* Persistent left rail (desktop) */}
      <aside
        className="hidden w-72 shrink-0 lg:block"
        aria-label="Recent conversations"
      >
        <div className="sticky top-20">
          <ConversationRail
            items={conversations ?? []}
            loading={isLoading}
            activeId={activeId}
            creating={creating}
            onNew={handleNew}
            onSelect={selectConversation}
          />
        </div>
      </aside>

      {/* Main console */}
      <div className="min-w-0 flex-1">
        {/* Mobile new-conversation control */}
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <h1 className="text-sm font-medium text-text-primary">Console</h1>
          <Button
            variant="subtle"
            size="sm"
            onClick={handleNew}
            disabled={creating}
          >
            <Plus aria-hidden /> New
          </Button>
        </div>
        <HugoConsole
          key={activeId ?? "new"}
          conversationId={activeId}
          className="animate-rise"
        />
      </div>
    </div>
  );
}

function ConversationRail({
  items,
  loading,
  activeId,
  creating,
  onNew,
  onSelect,
}: {
  items: {
    _id: Id<"conversations">;
    title: string;
    mode: ConversationMode;
    lastMessageAt: number;
  }[];
  loading: boolean;
  activeId?: string;
  creating: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="panel flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden p-2">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
          Recent
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={onNew}
          disabled={creating}
          aria-label="Start a new conversation"
        >
          <Plus aria-hidden /> New
        </Button>
      </div>

      <div className="scroll-thin mt-1 flex flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))
        ) : items.length === 0 ? (
          <EmptyRail onNew={onNew} creating={creating} />
        ) : (
          items.map((c) => {
            const isActive = c._id === activeId;
            return (
              <button
                key={c._id}
                type="button"
                onClick={() => onSelect(c._id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "group flex flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-hugo-cyan/50",
                  isActive
                    ? "border-hugo-cyan/30 bg-hugo-cyan/[0.06]"
                    : "border-transparent hover:border-border hover:bg-surface-elevated/50",
                )}
              >
                <span
                  className={cn(
                    "line-clamp-1 text-sm",
                    isActive
                      ? "text-text-primary"
                      : "text-text-secondary group-hover:text-text-primary",
                  )}
                >
                  {c.title}
                </span>
                <span className="flex items-center gap-2">
                  <ModeBadge mode={c.mode} />
                  <span className="font-mono text-[0.65rem] text-text-muted">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyRail({
  onNew,
  creating,
}: {
  onNew: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface-elevated/60">
        <MessageSquarePlus aria-hidden className="size-5 text-text-muted" />
      </span>
      <p className="text-xs text-text-muted">
        No conversations yet. Start talking and they&apos;ll show up here.
      </p>
      <Button
        variant="subtle"
        size="sm"
        onClick={onNew}
        disabled={creating}
      >
        <Plus aria-hidden /> New conversation
      </Button>
    </div>
  );
}

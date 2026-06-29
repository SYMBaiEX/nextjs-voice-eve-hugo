"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Activity, AlertTriangle, Radio, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator, Skeleton } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  cn,
  formatDuration,
  formatUsd,
  shortId,
  timeAgo,
} from "@/lib/utils";

type SessionStatus = "created" | "connecting" | "active" | "ended" | "failed";

type VoiceSessionRow = {
  _id: Id<"voiceSessions">;
  userId: Id<"users">;
  conversationId: Id<"conversations">;
  provider: string;
  model: string;
  voice: string;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  interruptionCount: number;
  turnCount: number;
  errorCode?: string;
  errorMessage?: string;
  ownerEmail: string | null;
};

type AgentEventRow = {
  _id: Id<"agentEvents">;
  eventType: string;
  status: string;
  payload?: unknown;
  createdAt: number;
};

type UsageEventRow = {
  _id: Id<"usageEvents">;
  type: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioInputSeconds?: number;
  audioOutputSeconds?: number;
  estimatedCost?: number;
};

type Diagnostics = {
  session: VoiceSessionRow;
  events: AgentEventRow[];
  usage: UsageEventRow[];
} | null;

const STATUS_BADGE: Record<SessionStatus, BadgeProps["variant"]> = {
  created: "muted",
  connecting: "warning",
  active: "success",
  ended: "muted",
  failed: "error",
};

const STATUS_FILTERS: (SessionStatus | "all")[] = [
  "all",
  "active",
  "connecting",
  "ended",
  "failed",
];

const COLSPAN = 9;

export default function AdminVoiceSessionsPage() {
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [openId, setOpenId] = useState<Id<"voiceSessions"> | null>(null);

  const sessions = useQuery(api.voiceSessions.listForAdmin, {
    status: status === "all" ? undefined : status,
  }) as VoiceSessionRow[] | undefined;

  const total = sessions?.length ?? 0;
  const failures = useMemo(
    () => sessions?.filter((s) => s.status === "failed").length ?? 0,
    [sessions],
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-text-primary">
            Voice Sessions
          </h1>
          <span className="font-mono text-xs text-text-muted">
            {sessions === undefined ? "—" : `${total} shown`}
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          Realtime session diagnostics, latency, and failure inspection.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-text-muted">
            Status
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated/40 p-1">
            {STATUS_FILTERS.map((opt) => (
              <Button
                key={opt}
                size="sm"
                variant={status === opt ? "subtle" : "ghost"}
                onClick={() => setStatus(opt)}
                className={cn(
                  "h-7 px-2.5 text-xs capitalize",
                  status === opt && "text-text-primary",
                )}
              >
                {opt}
              </Button>
            ))}
          </div>
        </div>
        {failures > 0 && (
          <Badge variant="error">
            <AlertTriangle className="size-3" /> {failures} failed
          </Badge>
        )}
      </div>

      <div className="panel overflow-hidden p-0">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>ID</TH>
              <TH>Owner</TH>
              <TH>Model</TH>
              <TH>Voice</TH>
              <TH>Status</TH>
              <TH className="text-right">Duration</TH>
              <TH className="text-right">Turns</TH>
              <TH className="text-right">Interrupts</TH>
              <TH>Error</TH>
            </TR>
          </THead>
          <TBody>
            {sessions === undefined &&
              Array.from({ length: 6 }).map((_, i) => (
                <TR key={`s-${i}`} className="hover:bg-transparent">
                  <TD colSpan={COLSPAN}>
                    <Skeleton className="h-5 w-full" />
                  </TD>
                </TR>
              ))}

            {sessions !== undefined && total === 0 && (
              <TR className="hover:bg-transparent">
                <TD colSpan={COLSPAN} className="py-10 text-center text-text-muted">
                  No voice sessions match this filter.
                </TD>
              </TR>
            )}

            {sessions?.map((s) => {
              const failed = s.status === "failed";
              return (
                <TR
                  key={s._id}
                  onClick={() => setOpenId(s._id)}
                  className={cn(
                    "cursor-pointer",
                    failed && "bg-error/[0.04] hover:bg-error/[0.08]",
                    openId === s._id && "bg-surface-elevated/60",
                  )}
                >
                  <TD className="font-mono text-xs text-text-primary">
                    {shortId(s._id)}
                  </TD>
                  <TD className="max-w-[14rem] truncate font-mono text-xs">
                    {s.ownerEmail ?? <span className="text-text-muted">—</span>}
                  </TD>
                  <TD className="font-mono text-xs text-text-secondary">
                    {s.model}
                  </TD>
                  <TD className="text-xs">{s.voice}</TD>
                  <TD>
                    <Badge variant={STATUS_BADGE[s.status]}>{s.status}</Badge>
                  </TD>
                  <TD className="text-right font-mono text-xs text-text-secondary">
                    {s.durationMs != null ? formatDuration(s.durationMs) : "—"}
                  </TD>
                  <TD className="text-right font-mono text-xs">{s.turnCount}</TD>
                  <TD className="text-right font-mono text-xs">
                    {s.interruptionCount}
                  </TD>
                  <TD className="max-w-[10rem] truncate">
                    {s.errorCode ? (
                      <span className="font-mono text-xs text-error">
                        {s.errorCode}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      {openId && (
        <DiagnosticsDrawer
          voiceSessionId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function DiagnosticsDrawer({
  voiceSessionId,
  onClose,
}: {
  voiceSessionId: Id<"voiceSessions">;
  onClose: () => void;
}) {
  const diagnostics = useQuery(api.voiceSessions.getDiagnostics, {
    voiceSessionId,
  }) as Diagnostics | undefined;

  const usageTotals = useMemo(() => {
    const usage = diagnostics?.usage ?? [];
    return usage.reduce(
      (acc, u) => {
        acc.inputTokens += u.inputTokens ?? 0;
        acc.outputTokens += u.outputTokens ?? 0;
        acc.audioSeconds += (u.audioInputSeconds ?? 0) + (u.audioOutputSeconds ?? 0);
        acc.cost += u.estimatedCost ?? 0;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, audioSeconds: 0, cost: 0 },
    );
  }, [diagnostics]);

  const session = diagnostics?.session;
  const failed = session?.status === "failed";

  return (
    <aside
      className={cn(
        "panel flex flex-col gap-4 p-5 animate-rise",
        failed && "border-error/30",
      )}
      aria-label="Voice session diagnostics"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radio aria-hidden className="size-4 text-hugo-cyan" />
            <p className="font-mono text-sm text-text-primary">
              {shortId(voiceSessionId)}
            </p>
            {session && (
              <Badge variant={STATUS_BADGE[session.status]}>
                {session.status}
              </Badge>
            )}
          </div>
          {session && (
            <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
              {session.ownerEmail ?? "unknown"} · {session.model} ·{" "}
              {session.voice}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close diagnostics"
        >
          <X />
        </Button>
      </div>

      {diagnostics === undefined && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {diagnostics === null && (
        <p className="py-6 text-center text-sm text-text-muted">
          Session not found.
        </p>
      )}

      {diagnostics && session && (
        <>
          {failed && session.errorMessage && (
            <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 px-3 py-2">
              <AlertTriangle
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-error"
              />
              <div className="min-w-0">
                {session.errorCode && (
                  <p className="font-mono text-xs text-error">
                    {session.errorCode}
                  </p>
                )}
                <p className="text-xs text-text-secondary">
                  {session.errorMessage}
                </p>
              </div>
            </div>
          )}

          {/* Usage rollup */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="Duration" value={formatDuration(session.durationMs ?? 0)} />
            <Metric
              label="Audio"
              value={`${(usageTotals.audioSeconds / 60).toFixed(1)}m`}
            />
            <Metric label="In tokens" value={usageTotals.inputTokens.toLocaleString()} />
            <Metric
              label="Out tokens"
              value={usageTotals.outputTokens.toLocaleString()}
            />
            <Metric label="Est. cost" value={formatUsd(usageTotals.cost)} />
          </div>

          <Separator />

          {/* Event timeline */}
          <div className="flex items-center gap-2">
            <Activity aria-hidden className="size-4 text-text-muted" />
            <h3 className="text-sm font-medium text-text-primary">Timeline</h3>
            <span className="font-mono text-xs text-text-muted">
              {diagnostics.events.length} events
            </span>
          </div>

          {diagnostics.events.length === 0 ? (
            <p className="rounded-md border border-border bg-surface-elevated/40 px-3 py-6 text-center text-xs text-text-muted">
              No agent events recorded for this session.
            </p>
          ) : (
            <ol className="scroll-thin max-h-80 space-y-2 overflow-y-auto pr-1">
              {diagnostics.events.map((ev) => {
                const isError = ev.status === "error" || ev.status === "failed";
                return (
                  <li
                    key={ev._id}
                    className={cn(
                      "flex items-start gap-3 rounded-md border px-3 py-2",
                      isError
                        ? "border-error/30 bg-error/[0.06]"
                        : "border-border bg-surface-elevated/40",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        isError ? "bg-error" : "bg-hugo-cyan",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-text-primary">
                          {ev.eventType}
                        </span>
                        <span className="shrink-0 font-mono text-[0.65rem] text-text-muted">
                          {timeAgo(ev.createdAt)}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-[0.65rem] uppercase tracking-wide",
                          isError ? "text-error" : "text-text-muted",
                        )}
                      >
                        {ev.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated/40 p-3">
      <p className="font-mono text-base text-text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}

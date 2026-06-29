"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { Check, X, Clock, AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { timeAgo, formatDuration } from "@/lib/utils";

/**
 * Admin → Tool Calls (PRD 5.10). Two sections: a pending-approval queue with
 * inline approve/deny, and a recent tool-call ledger across all users. The
 * pending queue uses the explicit risk-gated approval flow; the ledger is
 * observability-only.
 */

type ToolCallRow = Doc<"toolCalls"> & { ownerEmail: string | null };

/** Approval-status → Badge variant. */
function approvalVariant(status: Doc<"toolCalls">["approvalStatus"]): BadgeProps["variant"] {
  switch (status) {
    case "approved":
      return "success";
    case "denied":
      return "error";
    case "pending":
      return "warning";
    default:
      return "muted";
  }
}

export default function AdminToolCallsPage() {
  const pending = useQuery(api.toolCalls.pendingApprovals);
  const recent = useQuery(api.toolCalls.listForAdmin, { limit: 200 });
  const review = useMutation(api.toolCalls.review);

  const pendingLoading = pending === undefined;
  const recentLoading = recent === undefined;

  // Track in-flight reviews per tool call so buttons can show a spinner + disable.
  const [reviewing, setReviewing] = useState<Record<string, boolean>>({});

  async function handleReview(
    toolCallId: Id<"toolCalls">,
    decision: "approved" | "denied",
    toolName: string,
  ) {
    setReviewing((m) => ({ ...m, [toolCallId]: true }));
    try {
      await review({ toolCallId, decision });
      toast.success(
        decision === "approved"
          ? `Approved “${toolName}”`
          : `Denied “${toolName}”`,
      );
    } catch {
      toast.error("Could not record decision. Try again.");
    } finally {
      setReviewing((m) => {
        const next = { ...m };
        delete next[toolCallId];
        return next;
      });
    }
  }

  const recentColumns: DataTableColumn<ToolCallRow>[] = [
    {
      key: "toolName",
      header: "Tool",
      render: (r) => (
        <span className="font-mono text-text-primary">{r.toolName}</span>
      ),
    },
    {
      key: "ownerEmail",
      header: "Owner",
      render: (r) => (
        <span className="font-mono text-xs text-text-secondary">
          {r.ownerEmail ?? "—"}
        </span>
      ),
    },
    {
      key: "approvalStatus",
      header: "Approval",
      render: (r) => (
        <Badge variant={approvalVariant(r.approvalStatus)}>
          {r.approvalStatus}
        </Badge>
      ),
    },
    {
      key: "startedAt",
      header: "Started",
      className: "whitespace-nowrap",
      render: (r) => (
        <span
          className="font-mono text-xs text-text-muted"
          title={new Date(r.startedAt).toLocaleString()}
        >
          {timeAgo(r.startedAt)}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      className: "whitespace-nowrap text-right",
      render: (r) =>
        r.completedAt ? (
          <span className="font-mono tabular-nums text-text-secondary">
            {formatDuration(r.completedAt - r.startedAt)}
          </span>
        ) : (
          <span className="font-mono text-xs text-text-muted">running…</span>
        ),
    },
    {
      key: "error",
      header: "Error",
      className: "w-full",
      render: (r) =>
        r.error ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-error">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="line-clamp-1">{r.error}</span>
          </span>
        ) : (
          <span className="font-mono text-xs text-text-muted">—</span>
        ),
    },
  ];

  return (
    <div className="animate-rise space-y-6">
      <AdminPageHeader
        title="Tool Calls"
        description="Review risk-gated tool approvals and inspect recent tool activity."
      />

      {/* Pending approval queue */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-warning" />
            <CardTitle>Pending approvals</CardTitle>
          </div>
          {!pendingLoading && pending.length > 0 ? (
            <Badge variant="warning">{pending.length} waiting</Badge>
          ) : null}
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
              <Check className="size-4 text-success" />
              Queue clear — no tool calls awaiting approval.
            </div>
          ) : (
            <ul className="space-y-2">
              {pending.map((call) => {
                const busy = !!reviewing[call._id];
                return (
                  <li
                    key={call._id}
                    className="flex flex-col gap-3 rounded-md border border-border bg-surface-elevated/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-text-primary">
                          {call.toolName}
                        </span>
                        <Badge variant="muted">
                          {call.ownerEmail ?? "unknown"}
                        </Badge>
                        <span
                          className="font-mono text-[11px] text-text-muted"
                          title={new Date(call.startedAt).toLocaleString()}
                        >
                          {timeAgo(call.startedAt)}
                        </span>
                      </div>
                      {call.input !== undefined && call.input !== null ? (
                        <code className="block max-w-xl truncate font-mono text-[11px] text-text-muted">
                          {safeJson(call.input)}
                        </code>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          handleReview(call._id, "approved", call.toolName)
                        }
                      >
                        {busy ? <Spinner /> : <Check className="size-4" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          handleReview(call._id, "denied", call.toolName)
                        }
                      >
                        <X className="size-4" />
                        Deny
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent tool calls ledger */}
      <Card>
        <CardHeader>
          <CardTitle>Recent tool calls</CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {recentLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={recentColumns}
              rows={recent}
              rowKey={(r) => r._id}
              empty="No tool calls recorded yet."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Compact one-line JSON for inline previews; never throws. */
function safeJson(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return String(value);
  }
}

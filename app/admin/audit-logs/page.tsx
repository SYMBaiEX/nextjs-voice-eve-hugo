"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { timeAgo, shortId } from "@/lib/utils";

/**
 * Admin → Audit Logs (PRD 5.8 / 5.17). Read-only, append-only record of every
 * privileged admin action: role/status changes, settings updates, tool reviews,
 * and content moderation. Most recent first.
 */

type AuditRow = Doc<"adminAuditLogs"> & { adminEmail: string | null };

/** Colour the action badge by its verb family (mutating vs destructive vs read). */
function actionVariant(action: string): BadgeProps["variant"] {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("disable") || a.includes("denied"))
    return "error";
  if (a.includes("approved") || a.includes("setrole") || a.includes("create"))
    return "success";
  if (a.includes("settings") || a.includes("update") || a.includes("setstatus"))
    return "blue";
  return "muted";
}

export default function AdminAuditLogsPage() {
  const logs = useQuery(api.admin.auditLogs, { limit: 200 });
  const loading = logs === undefined;

  const columns: DataTableColumn<AuditRow>[] = [
    {
      key: "createdAt",
      header: "When",
      className: "whitespace-nowrap",
      render: (r) => (
        <span
          className="font-mono text-xs text-text-muted"
          title={new Date(r.createdAt).toLocaleString()}
        >
          {timeAgo(r.createdAt)}
        </span>
      ),
    },
    {
      key: "adminEmail",
      header: "Admin",
      render: (r) => (
        <span className="font-mono text-xs text-text-secondary">
          {r.adminEmail ?? "—"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (r) => <Badge variant={actionVariant(r.action)}>{r.action}</Badge>,
    },
    {
      key: "targetType",
      header: "Target",
      render: (r) => (
        <span className="font-mono text-xs text-text-secondary">
          {r.targetType}
        </span>
      ),
    },
    {
      key: "targetId",
      header: "Target ID",
      className: "whitespace-nowrap",
      render: (r) =>
        r.targetId ? (
          <span className="font-mono text-xs text-text-muted" title={r.targetId}>
            {shortId(r.targetId)}
          </span>
        ) : (
          <span className="font-mono text-xs text-text-muted">—</span>
        ),
    },
    {
      key: "metadata",
      header: "Metadata",
      className: "w-full",
      render: (r) => <MetadataPreview metadata={r.metadata} />,
    },
  ];

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Audit Logs"
        description="Append-only record of every privileged admin action. Read-only."
        actions={
          loading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <Badge variant="muted">{logs.length} entries</Badge>
          )
        }
      />

      <Card>
        <CardContent className="px-0 py-0">
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={logs}
              rowKey={(r) => r._id}
              empty="No admin actions recorded yet."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Read-only one-line metadata preview (expand on click). */
function MetadataPreview({ metadata }: { metadata: unknown }) {
  const [expanded, setExpanded] = useState(false);

  if (metadata === undefined || metadata === null) {
    return <span className="font-mono text-xs text-text-muted">—</span>;
  }

  let json: string;
  try {
    json = JSON.stringify(metadata, null, expanded ? 2 : 0);
  } catch {
    json = String(metadata);
  }

  const truncated = !expanded && json.length > 64;
  const display = truncated ? `${json.slice(0, 64)}…` : json;

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="group max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-hugo-cyan/40 rounded"
      title={expanded ? "Click to collapse" : "Click to expand"}
    >
      {expanded ? (
        <pre className="scroll-thin max-h-56 max-w-xl overflow-auto rounded-md border border-border bg-surface-elevated/60 p-2 font-mono text-[11px] leading-relaxed text-text-secondary">
          {display}
        </pre>
      ) : (
        <code className="font-mono text-[11px] text-text-muted transition-colors group-hover:text-text-secondary">
          {display}
        </code>
      )}
    </button>
  );
}

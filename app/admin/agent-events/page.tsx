"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { timeAgo } from "@/lib/utils";

/**
 * Admin → Agent Events (PRD 5.9). Lifecycle markers for voice sessions, tool
 * runs, durable tasks, and warnings. Optional client-side event-type filter; a
 * compact JSON payload preview expands inline on click.
 */

type AgentEvent = Doc<"agentEvents">;

/** Map a status string to a Badge variant (success vs error vs neutral). */
function statusVariant(status: string): BadgeProps["variant"] {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success" || s === "completed") return "success";
  if (s === "error" || s === "failed" || s === "failure") return "error";
  if (s === "warning" || s === "warn") return "warning";
  if (s === "started" || s === "running" || s === "pending") return "blue";
  return "muted";
}

export default function AdminAgentEventsPage() {
  const [eventType, setEventType] = useState<string | "all">("all");
  const events = useQuery(api.agentEvents.listForAdmin, {
    eventType: eventType === "all" ? undefined : eventType,
    limit: 200,
  });
  const loading = events === undefined;

  // Distinct event types for the filter chips (derived from the current page).
  const types = useMemo(() => {
    if (!events) return [];
    return [...new Set(events.map((e) => e.eventType))].sort();
  }, [events]);

  const columns: DataTableColumn<AgentEvent>[] = [
    {
      key: "createdAt",
      header: "When",
      className: "whitespace-nowrap",
      render: (e) => (
        <span
          className="font-mono text-xs text-text-muted"
          title={new Date(e.createdAt).toLocaleString()}
        >
          {timeAgo(e.createdAt)}
        </span>
      ),
    },
    {
      key: "eventType",
      header: "Event",
      render: (e) => <Badge variant="cyan">{e.eventType}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (e) => (
        <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
      ),
    },
    {
      key: "payload",
      header: "Payload",
      className: "w-full",
      render: (e) => <PayloadPreview payload={e.payload} />,
    },
  ];

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Agent Events"
        description="Lifecycle markers from voice sessions, tool runs, and durable tasks."
        actions={
          loading ? (
            <Skeleton className="h-8 w-40" />
          ) : (
            <div
              role="group"
              aria-label="Filter by event type"
              className="flex flex-wrap items-center gap-1"
            >
              <Button
                size="sm"
                variant={eventType === "all" ? "subtle" : "ghost"}
                aria-pressed={eventType === "all"}
                onClick={() => setEventType("all")}
                className="font-mono text-xs"
              >
                all
              </Button>
              {types.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={eventType === t ? "subtle" : "ghost"}
                  aria-pressed={eventType === t}
                  onClick={() => setEventType(t)}
                  className="font-mono text-xs"
                >
                  {t}
                </Button>
              ))}
            </div>
          )
        }
      />

      <Card>
        <CardContent className="px-0 py-0">
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={events}
              rowKey={(e) => e._id}
              empty="No agent events recorded."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Truncated, click-to-expand JSON preview of an event payload. */
function PayloadPreview({ payload }: { payload: unknown }) {
  const [expanded, setExpanded] = useState(false);

  if (payload === undefined || payload === null) {
    return <span className="font-mono text-xs text-text-muted">—</span>;
  }

  let json: string;
  try {
    json = JSON.stringify(payload, null, expanded ? 2 : 0);
  } catch {
    json = String(payload);
  }

  const truncated = !expanded && json.length > 80;
  const display = truncated ? `${json.slice(0, 80)}…` : json;

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="group max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-hugo-cyan/40 rounded"
      title={expanded ? "Click to collapse" : "Click to expand"}
    >
      {expanded ? (
        <pre className="scroll-thin max-h-64 max-w-2xl overflow-auto rounded-md border border-border bg-surface-elevated/60 p-2 font-mono text-[11px] leading-relaxed text-text-secondary">
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

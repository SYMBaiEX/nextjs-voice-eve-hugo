"use client";

import { useQuery } from "convex/react";
import {
  Users,
  UserCheck,
  AudioLines,
  MessagesSquare,
  Gauge,
  AlertTriangle,
  DollarSign,
  RadioTower,
  ShieldQuestion,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AreaTrend, BarSeries } from "@/components/admin/UsageChart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { PALETTE } from "@/lib/constants";
import { formatUsd, formatCompact } from "@/lib/utils";

type OverviewResult = ReturnType<typeof useQuery<typeof api.admin.overview>>;
type SummaryResult = ReturnType<typeof useQuery<typeof api.usageEvents.globalSummary>>;

/** Short date label (YYYY-MM-DD -> MM/DD) for chart axes. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${m}/${d}` : iso;
}

/** Truncate a long model id (e.g. "openai/gpt-realtime-2" -> "gpt-realtime-2"). */
function modelLabel(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

export default function AdminOverviewPage() {
  const overview = useQuery(api.admin.overview);
  const summary = useQuery(api.usageEvents.globalSummary, { days: 14 });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-text-primary">Overview</h1>
          <span className="font-mono text-xs text-text-muted">
            today · last 14 days
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          Live operational snapshot across users, voice, text, spend, and the
          tool-approval queue.
        </p>
      </header>

      {/* KPI grid */}
      <MetricsGrid overview={overview} />

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Spend by day</CardTitle>
            <CardDescription>
              Estimated cost across all usage events · last 14 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary === undefined ? (
              <Skeleton className="h-[240px] w-full" />
            ) : summary.byDay.length === 0 ? (
              <EmptyChart label="No usage recorded in this window." />
            ) : (
              <AreaTrend
                data={summary.byDay.map((d) => ({
                  ...d,
                  label: shortDate(d.date),
                }))}
                dataKey="cost"
                xKey="label"
                color={PALETTE.cyan}
                valueFormatter={(v) => formatUsd(v)}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cost by model</CardTitle>
            <CardDescription>
              Top models by estimated spend · last 14 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary === undefined ? (
              <Skeleton className="h-[240px] w-full" />
            ) : summary.byModel.length === 0 ? (
              <EmptyChart label="No model spend yet." />
            ) : (
              <BarSeries
                data={summary.byModel.slice(0, 6).map((m) => ({
                  model: modelLabel(m.model),
                  cost: m.cost,
                }))}
                dataKey="cost"
                xKey="model"
                color={PALETTE.blue}
                valueFormatter={(v) => formatUsd(v)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top models / window totals */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Top models today</CardTitle>
            <CardDescription>Estimated spend per model since 00:00 UTC</CardDescription>
          </CardHeader>
          <CardContent>
            <TopModelsList overview={overview} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Window totals</CardTitle>
            <CardDescription>Aggregated across the last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <WindowTotals summary={summary} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-sections                                                        */
/* ------------------------------------------------------------------ */

function MetricsGrid({ overview }: { overview: OverviewResult }) {
  if (overview === undefined) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const errorPct = (overview.errorRate * 100).toFixed(1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <AdminMetricCard
        label="Total users"
        value={formatCompact(overview.totalUsers)}
        icon={Users}
        accent="neutral"
      />
      <AdminMetricCard
        label="Active today"
        value={formatCompact(overview.activeToday)}
        icon={UserCheck}
        accent="cyan"
      />
      <AdminMetricCard
        label="Voice sessions today"
        value={formatCompact(overview.voiceSessionsToday)}
        icon={AudioLines}
        accent="blue"
      />
      <AdminMetricCard
        label="Text convos today"
        value={formatCompact(overview.textConversationsToday)}
        icon={MessagesSquare}
        accent="magenta"
      />
      <AdminMetricCard
        label="Avg latency"
        value={
          <>
            {formatCompact(overview.avgLatencyMs)}
            <span className="ml-1 text-sm text-text-muted">ms</span>
          </>
        }
        icon={Gauge}
        accent={overview.avgLatencyMs > 1500 ? "warning" : "neutral"}
      />
      <AdminMetricCard
        label="Error rate"
        value={
          <>
            {errorPct}
            <span className="ml-0.5 text-sm text-text-muted">%</span>
          </>
        }
        icon={AlertTriangle}
        accent={overview.errorRate > 0.05 ? "error" : "success"}
      />
      <AdminMetricCard
        label="Spend today"
        value={formatUsd(overview.estimatedSpendToday)}
        icon={DollarSign}
        accent="success"
      />
      <AdminMetricCard
        label="Realtime failures"
        value={formatCompact(overview.realtimeFailuresToday)}
        sub="today"
        icon={RadioTower}
        accent={overview.realtimeFailuresToday > 0 ? "error" : "neutral"}
      />
      <AdminMetricCard
        label="Tool approvals"
        value={formatCompact(overview.toolApprovalQueue)}
        sub="pending"
        icon={ShieldQuestion}
        accent={overview.toolApprovalQueue > 0 ? "warning" : "neutral"}
      />
    </div>
  );
}

function TopModelsList({ overview }: { overview: OverviewResult }) {
  if (overview === undefined) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (overview.topModels.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No model spend recorded today.
      </p>
    );
  }

  const max = Math.max(...overview.topModels.map((m) => m.cost), 0.0001);

  return (
    <ul className="flex flex-col gap-3">
      {overview.topModels.map((m, i) => (
        <li key={m.model} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-[10px] text-text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="truncate font-mono text-xs text-text-secondary">
                {m.model}
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs text-text-primary tabular-nums">
              {formatUsd(m.cost)}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
            role="presentation"
          >
            <div
              className="h-full rounded-full bg-hugo-cyan/70"
              style={{ width: `${Math.max(4, (m.cost / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function WindowTotals({ summary }: { summary: SummaryResult }) {
  if (summary === undefined) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const totals: { label: string; value: string }[] = [
    { label: "Total cost", value: formatUsd(summary.totalCost) },
    { label: "Total events", value: formatCompact(summary.totalEvents) },
    { label: "Total tokens", value: formatCompact(summary.totalTokens) },
    { label: "Audio minutes", value: summary.audioMinutes.toFixed(1) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {totals.map((t) => (
        <div
          key={t.label}
          className="rounded-lg border border-border bg-surface-elevated/40 p-3"
        >
          <p className="font-mono text-lg text-text-primary tabular-nums">
            {t.value}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-border">
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  );
}

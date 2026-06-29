"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { DollarSign, Coins, Activity, AudioLines, Info } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AreaTrend, BarSeries } from "@/components/admin/UsageChart";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { PALETTE } from "@/lib/constants";
import { formatUsd, formatCompact } from "@/lib/utils";

/**
 * Admin → Usage & Cost (PRD 5.9). Global usage rollup over a selectable window:
 * KPI cards, a spend-over-time area chart, a cost-by-model bar chart, and a
 * per-model breakdown table. All figures are local estimates — the authoritative
 * spend lives in the AI Gateway dashboard (called out explicitly below).
 */

const DAY_OPTIONS = [7, 14, 30] as const;
type Days = (typeof DAY_OPTIONS)[number];

type ModelRow = {
  model: string;
  cost: number;
  events: number;
  tokens: number;
};

export default function AdminUsagePage() {
  const [days, setDays] = useState<Days>(14);
  const summary = useQuery(api.usageEvents.globalSummary, { days });
  const loading = summary === undefined;

  const byDay =
    summary?.byDay.map((d) => ({
      ...d,
      // Friendly short label (MM-DD) for the X axis.
      label: d.date.slice(5),
    })) ?? [];
  const byModel = summary?.byModel ?? [];
  // Cap the bar chart to the costliest models so labels stay legible.
  const topModelBars = byModel.slice(0, 8).map((m) => ({
    ...m,
    label: shortModel(m.model),
  }));

  const modelColumns: DataTableColumn<ModelRow>[] = [
    {
      key: "model",
      header: "Model",
      render: (r) => (
        <span className="font-mono text-text-primary">{r.model}</span>
      ),
    },
    {
      key: "events",
      header: "Events",
      className: "text-right",
      render: (r) => (
        <span className="font-mono tabular-nums">
          {formatCompact(r.events)}
        </span>
      ),
    },
    {
      key: "tokens",
      header: "Tokens",
      className: "text-right",
      render: (r) => (
        <span className="font-mono tabular-nums text-text-secondary">
          {formatCompact(r.tokens)}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Est. cost",
      className: "text-right",
      render: (r) => (
        <span className="font-mono tabular-nums text-hugo-cyan">
          {formatUsd(r.cost)}
        </span>
      ),
    },
  ];

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Usage & Cost"
        description="Estimated spend, tokens, and event volume across all users."
        actions={
          <div
            role="group"
            aria-label="Time window"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/60 p-1"
          >
            {DAY_OPTIONS.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === days ? "subtle" : "ghost"}
                aria-pressed={d === days}
                onClick={() => setDays(d)}
                className="font-mono text-xs"
              >
                {d}d
              </Button>
            ))}
          </div>
        }
      />

      {/* Estimate disclaimer */}
      <div className="mb-5 flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs text-text-secondary">
        <Info className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <p>
          These are{" "}
          <span className="text-text-primary">display-only estimates</span>{" "}
          derived from logged tokens and audio duration. Authoritative billed
          spend lives in the{" "}
          <span className="font-mono text-text-primary">AI Gateway</span>{" "}
          dashboard.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)
        ) : (
          <>
            <AdminMetricCard
              label="Total spend (est.)"
              value={formatUsd(summary.totalCost)}
              sub={`last ${days} days`}
              accent="cyan"
              icon={DollarSign}
            />
            <AdminMetricCard
              label="Total tokens"
              value={formatCompact(summary.totalTokens)}
              sub="input + output"
              accent="blue"
              icon={Coins}
            />
            <AdminMetricCard
              label="Total events"
              value={formatCompact(summary.totalEvents)}
              sub="usage rows"
              accent="magenta"
              icon={Activity}
            />
            <AdminMetricCard
              label="Audio minutes"
              value={summary.audioMinutes.toLocaleString()}
              sub="in + out"
              accent="success"
              icon={AudioLines}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estimated cost by day</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-60 w-full" />
            ) : byDay.length === 0 ? (
              <EmptyChart label="No usage in this window." />
            ) : (
              <AreaTrend
                data={byDay}
                xKey="label"
                dataKey="cost"
                color={PALETTE.cyan}
                valueFormatter={(v) => formatUsd(v)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimated cost by model</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-60 w-full" />
            ) : topModelBars.length === 0 ? (
              <EmptyChart label="No model spend recorded." />
            ) : (
              <BarSeries
                data={topModelBars}
                xKey="label"
                dataKey="cost"
                color={PALETTE.blue}
                valueFormatter={(v) => formatUsd(v)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* By-model table */}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Per-model breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-2 px-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={modelColumns}
              rows={byModel}
              rowKey={(r) => r.model}
              empty="No usage events in this window."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Trim a provider-prefixed model id for chart labels ("openai/gpt-5.5" → "gpt-5.5"). */
function shortModel(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

function MetricSkeleton() {
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-60 items-center justify-center text-sm text-text-muted">
      {label}
    </div>
  );
}

"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/rich-blocks";
import { PALETTE } from "@/lib/constants";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/**
 * ChartBlock — renders a validated `ChartSpec` (emitted by the model as a
 * fenced ```chart block and parsed by lib/rich-blocks.ts) as an inline
 * recharts chart. Themed exactly like `components/admin/UsageChart.tsx`: CSS
 * vars for axes/grid/chrome, PALETTE hexes for series (SVG can't read CSS
 * vars for gradients/strokes reliably), a surface-backed mono tooltip. Kept
 * defensive throughout — chat content is model-authored, so a malformed spec
 * should degrade to a placeholder, never throw and blank the transcript.
 */

const AXIS_STROKE = "var(--text-muted)";
const GRID_STROKE = "var(--border)";
const AXIS_FONT_SIZE = 10;
const CHART_HEIGHT = 240;

/** Cycle through the brand palette for series/slices that don't set their own color. */
const SERIES_COLORS = [
  PALETTE.cyan,
  PALETTE.blue,
  PALETTE.magenta,
  PALETTE.warning,
  PALETTE.error,
  PALETTE.success,
] as const;

function colorForIndex(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

const axisProps = {
  stroke: AXIS_STROKE,
  tick: { fill: AXIS_STROKE, fontSize: AXIS_FONT_SIZE },
  tickLine: false,
  axisLine: false,
} as const;

/** Small formatter for the tooltip + Y axis, keyed off the spec's declared format hint. */
function makeValueFormatter(format: ChartSpec["valueFormat"]): (value: number) => string {
  switch (format) {
    case "currency":
      return (value: number) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: value < 1 ? 4 : 2,
        }).format(value);
    case "percent":
      return (value: number) => `${value}%`;
    default:
      return (value: number) => new Intl.NumberFormat("en-US").format(value);
  }
}

interface TooltipPayloadEntry {
  value?: number | string;
  name?: string;
  color?: string;
  dataKey?: string | number;
}

/** Surface-backed tooltip shared across all four chart types; mono values, one row per series. */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  valueFormatter: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface-elevated/95 px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      {label !== undefined && (
        <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
          {label}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, index) => {
          const raw = entry.value;
          const num = typeof raw === "number" ? raw : Number(raw ?? 0);
          const display = Number.isFinite(num) ? valueFormatter(num) : String(raw ?? "");
          return (
            <p
              key={`${entry.dataKey ?? entry.name ?? index}`}
              className="flex items-center gap-1.5 font-mono text-xs text-text-primary"
            >
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: entry.color ?? colorForIndex(index) }}
              />
              {entry.name ? `${entry.name}: ` : ""}
              {display}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/** Bordered surface panel + optional title, matching MarkdownContent's table/pre chrome. */
function ChartPanel({
  spec,
  children,
}: {
  spec: Pick<ChartSpec, "title" | "type">;
  children: React.ReactNode;
}) {
  const label = spec.title ?? `${spec.type} chart`;
  return (
    <div
      role="img"
      aria-label={label}
      className="my-2 rounded-md border border-border bg-surface-elevated/40 p-3"
    >
      {spec.title && (
        <p className="mb-2 text-xs font-semibold text-text-secondary">{spec.title}</p>
      )}
      {children}
    </div>
  );
}

function EmptyChart({ spec }: { spec: Pick<ChartSpec, "title" | "type"> }) {
  return (
    <ChartPanel spec={spec}>
      <div
        className="flex h-[120px] items-center justify-center text-xs text-text-muted"
        style={{ height: 120 }}
      >
        No chart data
      </div>
    </ChartPanel>
  );
}

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  const reduced = useReducedMotion();
  const gradientId = useId().replace(/:/g, "");

  // Defensive: malformed/empty specs render a muted placeholder instead of a
  // broken or blank chart — chat content is model-authored and unvalidated
  // beyond the parser's best effort.
  if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) {
    return <EmptyChart spec={spec ?? { type: "bar" }} />;
  }
  if (!Array.isArray(spec.series) || spec.series.length === 0) {
    return <EmptyChart spec={spec} />;
  }

  const valueFormatter = makeValueFormatter(spec.valueFormat);
  const margin = { top: 8, right: 8, bottom: 0, left: -12 };

  let chart: React.ReactNode;

  if (spec.type === "pie") {
    const primary = spec.series[0];
    chart = (
      <PieChart>
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <Pie
          data={spec.data}
          dataKey={primary.key}
          nameKey={spec.xKey}
          cx="50%"
          cy="50%"
          outerRadius={88}
          isAnimationActive={!reduced}
        >
          {spec.data.map((_, index) => (
            <Cell key={index} fill={colorForIndex(index)} />
          ))}
        </Pie>
      </PieChart>
    );
  } else if (spec.type === "line") {
    chart = (
      <LineChart data={spec.data} margin={margin}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={spec.xKey} {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} width={48} tickFormatter={valueFormatter} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        {spec.series.map((series, index) => {
          const color = series.color ?? colorForIndex(index);
          return (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label ?? series.key}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
              isAnimationActive={!reduced}
            />
          );
        })}
      </LineChart>
    );
  } else if (spec.type === "area") {
    chart = (
      <AreaChart data={spec.data} margin={margin}>
        <defs>
          {spec.series.map((series, index) => {
            const color = series.color ?? colorForIndex(index);
            return (
              <linearGradient
                key={series.key}
                id={`${gradientId}-${index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={spec.xKey} {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} width={48} tickFormatter={valueFormatter} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        {spec.series.map((series, index) => {
          const color = series.color ?? colorForIndex(index);
          return (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label ?? series.key}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId}-${index})`}
              dot={false}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
              isAnimationActive={!reduced}
            />
          );
        })}
      </AreaChart>
    );
  } else {
    // "bar" — the default/fallback type.
    chart = (
      <BarChart data={spec.data} margin={margin}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={spec.xKey} {...axisProps} interval={0} minTickGap={4} />
        <YAxis {...axisProps} width={48} tickFormatter={valueFormatter} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
        {spec.series.map((series, index) => {
          const color = series.color ?? colorForIndex(index);
          return (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label ?? series.key}
              fill={color}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={!reduced}
            />
          );
        })}
      </BarChart>
    );
  }

  return (
    <ChartPanel spec={spec}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        {chart}
      </ResponsiveContainer>
    </ChartPanel>
  );
}

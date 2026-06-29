"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PALETTE } from "@/lib/constants";

/**
 * Recharts wrappers themed to the Hugo command-center palette. These read CSS
 * variables for axes/grid (so they track light/dark automatically) and use the
 * JS-side PALETTE hexes for series strokes/fills (SVG gradients can't reference
 * CSS vars reliably across renderers). Charts are intentionally minimal: thin
 * axes, faint grid, a single surface-backed tooltip — data first, not decor.
 */

const AXIS_STROKE = "var(--text-muted)";
const GRID_STROKE = "var(--border)";
const AXIS_FONT_SIZE = 10;

type Datum = Record<string, string | number>;

interface BaseChartProps {
  data: Datum[];
  dataKey: string;
  xKey: string;
  color?: string;
  height?: number;
  /** Optional value formatter for the tooltip + Y axis. */
  valueFormatter?: (value: number) => string;
}

/** Shared tooltip content with a surface background, mono values, and a swatch. */
function ChartTooltip({
  active,
  payload,
  label,
  color,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string }>;
  label?: string | number;
  color: string;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value;
  const num = typeof raw === "number" ? raw : Number(raw ?? 0);
  const display =
    valueFormatter && Number.isFinite(num) ? valueFormatter(num) : String(raw ?? "");
  return (
    <div className="rounded-md border border-border bg-surface-elevated/95 px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="flex items-center gap-1.5 font-mono text-xs text-text-primary">
        <span
          aria-hidden="true"
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {display}
      </p>
    </div>
  );
}

const axisProps = {
  stroke: AXIS_STROKE,
  tick: { fill: AXIS_STROKE, fontSize: AXIS_FONT_SIZE },
  tickLine: false,
  axisLine: false,
} as const;

/** Gradient-filled area trend — the primary time-series chart (e.g. spend/day). */
export function AreaTrend({
  data,
  dataKey,
  xKey,
  color = PALETTE.cyan,
  height = 240,
  valueFormatter,
}: BaseChartProps) {
  const gradientId = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} width={48} tickFormatter={valueFormatter} />
        <Tooltip
          cursor={{ stroke: color, strokeOpacity: 0.3 }}
          content={
            <ChartTooltip color={color} valueFormatter={valueFormatter} />
          }
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Vertical bar series — good for categorical comparisons (e.g. cost per model). */
export function BarSeries({
  data,
  dataKey,
  xKey,
  color = PALETTE.blue,
  height = 240,
  valueFormatter,
}: BaseChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} interval={0} minTickGap={4} />
        <YAxis {...axisProps} width={48} tickFormatter={valueFormatter} />
        <Tooltip
          cursor={{ fill: color, fillOpacity: 0.08 }}
          content={
            <ChartTooltip color={color} valueFormatter={valueFormatter} />
          }
        />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Compact, axis-less line — for inline trend hints inside cards/rows. */
export function Sparkline({
  data,
  dataKey,
  color = PALETTE.cyan,
  height = 36,
}: {
  data: Datum[];
  dataKey: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

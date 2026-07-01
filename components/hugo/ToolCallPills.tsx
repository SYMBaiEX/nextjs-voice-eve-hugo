"use client";

import { useState } from "react";
import { ChevronDown, Wrench } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { toolLabel } from "@/lib/tool-labels";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { cn } from "@/lib/utils";

/**
 * ToolCallPills — one small chip per tool the agent ran in a turn, expandable
 * to show its redacted input/output. Reads straight off the Convex
 * `toolCalls` ledger, so it renders identically regardless of which runtime
 * (voice, BYOK text, Eve) actually made the call — that ledger is the one
 * uniform data source across all of them.
 */

type ToolCall = Doc<"toolCalls">;

/** "Xms" under a second, "Xs" otherwise — finer-grained than the app's
 *  general-purpose `formatDuration` (that one floors sub-second calls to
 *  "0s", which would hide the actual latency for most tool calls here). */
function formatCallDuration(startedAt: number, completedAt?: number): string {
  if (completedAt == null) return "running…";
  const ms = Math.max(0, completedAt - startedAt);
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Best-effort pretty-print — tool I/O is already redacted at write time, but
 *  never let an odd shape (undefined, a circular value, whatever) throw and
 *  take the whole transcript down with it. */
function safeStringify(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StatusDot({ call }: { call: ToolCall }) {
  const reducedMotion = useReducedMotion();
  const isRunning = call.completedAt == null;
  const isError = !!call.error;
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        isRunning && "bg-hugo-cyan",
        !isRunning && isError && "bg-error",
        !isRunning && !isError && "bg-success",
        isRunning && !reducedMotion && "animate-pulse",
      )}
    />
  );
}

function ToolCallPill({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const inputJson = safeStringify(call.input);
  const outputJson = safeStringify(call.output);

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-transparent px-2 py-1 text-xs text-text-secondary transition-colors duration-fast ease-hugo hover:border-border-strong hover:text-text-primary"
      >
        <StatusDot call={call} />
        <Wrench aria-hidden className="size-3" />
        <span>{toolLabel(call.toolName)}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3 transition-transform duration-fast ease-hugo",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="mt-1.5 w-full max-w-sm rounded-lg border border-border bg-surface-elevated p-2.5 text-xs">
          <div className="mb-1.5 flex items-center justify-between text-text-muted">
            <span>{toolLabel(call.toolName)}</span>
            <span>{formatCallDuration(call.startedAt, call.completedAt)}</span>
          </div>

          {inputJson && (
            <div className="mb-1.5">
              <div className="mb-0.5 text-text-muted">Input</div>
              <pre className="scroll-thin max-h-40 overflow-auto rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed text-text-secondary">
                {inputJson}
              </pre>
            </div>
          )}

          {outputJson && (
            <div className="mb-1.5">
              <div className="mb-0.5 text-text-muted">Output</div>
              <pre className="scroll-thin max-h-40 overflow-auto rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed text-text-secondary">
                {outputJson}
              </pre>
            </div>
          )}

          {call.error && (
            <div>
              <div className="mb-0.5 text-text-muted">Error</div>
              <p className="text-error">{call.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallPills({ calls }: { calls: ToolCall[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {calls.map((call) => (
        <ToolCallPill key={call._id} call={call} />
      ))}
    </div>
  );
}

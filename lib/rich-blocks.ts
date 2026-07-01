import { z } from "zod";

/**
 * rich-blocks — the schema + safe parser for Hugo's "rich" fenced-code
 * blocks: the mechanism by which the agent embeds a real component inside a
 * chat markdown response instead of just describing data in prose.
 *
 * Convention: the model emits a normal fenced code block whose info-string is
 * one of `RICH_BLOCK_LANGS` (e.g. ```chart) and whose body is JSON matching
 * that block's schema (e.g. `ChartSpec` for `chart`). The markdown renderer
 * intercepts fences with a known language, parses the body with
 * `parseRichBlock`, and swaps in the matching component; every other fence
 * (unknown language, or a known language with invalid JSON/shape) renders as
 * a plain `<code>` block, unmodified.
 *
 * This is deliberately data-only: JSON in, one known component out — never
 * HTML or JSX. Same posture as `MarkdownContent` disabling raw HTML — model
 * output can incorporate arbitrary web content, so the set of things it can
 * cause to render must stay a small, fixed, non-executable vocabulary.
 *
 * Pure module (no React, no DOM) so it can be imported by the client
 * component that renders the block AND by anything documenting the contract
 * for the agent's instructions.
 */

/** The one canonical shape both this file and `ChartBlock.tsx` must agree on. */
export const chartSpecSchema = z.object({
  type: z.enum(["bar", "line", "area", "pie"]),
  /** Optional heading rendered above the chart. */
  title: z.string().optional(),
  /** Rows — each a flat record of the category key plus one value per series. */
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  /** The category/name key in each row (x-axis for bar/line/area; slice name for pie). */
  xKey: z.string(),
  /** The numeric value key(s) to plot; pie charts use series[0].key as the value. */
  series: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().optional(),
        color: z.string().optional(),
      })
    )
    .min(1),
  /** Optional hint for how tooltips/axes should format values. */
  valueFormat: z.enum(["number", "currency", "percent"]).optional(),
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;

/*
 * EXAMPLE — a valid ```chart fenced block body (copy into agent instructions):
 *
 * {
 *   "type": "bar",
 *   "title": "Monthly signups",
 *   "data": [
 *     { "month": "Jan", "signups": 120 },
 *     { "month": "Feb", "signups": 180 },
 *     { "month": "Mar", "signups": 150 }
 *   ],
 *   "xKey": "month",
 *   "series": [{ "key": "signups", "label": "Signups", "color": "var(--hugo-cyan)" }],
 *   "valueFormat": "number"
 * }
 */

/** Fenced-code info-strings the markdown renderer treats as rich components. */
export const RICH_BLOCK_LANGS = ["chart"] as const;

export type RichBlockLang = (typeof RICH_BLOCK_LANGS)[number];

/** Cheap membership check so the renderer can guard before attempting a parse. */
export function isRichBlockLang(lang: string): lang is RichBlockLang {
  return (RICH_BLOCK_LANGS as readonly string[]).includes(lang);
}

/** Why a rich block failed to parse — lets the caller fail closed silently. */
export type RichBlockFailureReason = "unknown-lang" | "invalid-json" | "invalid-shape";

export type ParsedRichBlock =
  | { ok: true; kind: "chart"; spec: ChartSpec }
  | { ok: false; reason: RichBlockFailureReason };

/**
 * Parse a fenced code block's language + raw body into a typed rich block.
 *
 * Never throws: this runs on possibly-incomplete streaming text (the fence
 * may not have closed yet, or the JSON may be mid-token), so malformed or
 * partial input must fail closed cleanly rather than crash the render —
 * the caller falls back to a plain code block until the JSON completes.
 */
export function parseRichBlock(lang: string, raw: string): ParsedRichBlock {
  if (!isRichBlockLang(lang)) {
    return { ok: false, reason: "unknown-lang" };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  switch (lang) {
    case "chart": {
      const result = chartSpecSchema.safeParse(json);
      if (!result.success) {
        return { ok: false, reason: "invalid-shape" };
      }
      return { ok: true, kind: "chart", spec: result.data };
    }
  }
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/**
 * CodeBlock — syntax-highlighted fenced code for chat, replacing the plain
 * `<pre>` MarkdownContent used to render. Highlighting goes through Shiki's
 * direct JS API (not a rehype plugin) so we can keep a single module-level
 * highlighter alive for the whole app instead of paying setup cost per
 * message, and so the always-visible plain fallback below can render before
 * (or instead of) any highlighting work completes.
 */

// Capped language set: covers what Hugo actually talks about (web/agent
// stack, shell, data) without pulling in Shiki's full grammar catalog.
const SUPPORTED_LANGS = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "json",
  "bash",
  "shell",
  "python",
  "sql",
  "markdown",
  "html",
  "css",
  "yaml",
  "go",
  "rust",
] as const;

type SupportedLang = (typeof SUPPORTED_LANGS)[number];

// Light/dark theme pair — picked to read well on Hugo's near-black surface:
// github-dark is a familiar, high-contrast dark theme; github-light is its
// safe, high-contrast light counterpart.
const THEMES = {
  dark: "github-dark",
  light: "github-light",
} as const;

type ShikiHighlighter = import("shiki").Highlighter;

// Module-level singleton: created once for the whole app (lazily, on first
// use) rather than per-message. `getSingletonHighlighter` already dedupes
// concurrent calls internally, but we still cache the promise so re-renders
// and other CodeBlock instances all await the same instance.
let highlighterPromise: Promise<ShikiHighlighter> | null = null;

function loadHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.getSingletonHighlighter({
        themes: [THEMES.dark, THEMES.light],
        langs: [...SUPPORTED_LANGS],
      })
    );
  }
  return highlighterPromise;
}

function normalizeLang(language: string | undefined): string {
  if (!language) return "text";
  const lower = language.toLowerCase().trim();
  return (SUPPORTED_LANGS as readonly string[]).includes(lower)
    ? (lower as SupportedLang)
    : "text";
}

/** Plain, always-visible fallback — used before/while/if highlighting fails. */
function PlainCode({ code }: { code: string }) {
  return (
    <pre className="scroll-thin overflow-x-auto p-3 font-mono text-[0.8em] leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const { resolvedTheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  // Bumped on every relevant input change so a slow, stale highlight result
  // (from a prior render, e.g. mid-stream) can never clobber a newer one.
  const requestId = useRef(0);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lang = normalizeLang(language);
  const isDark = resolvedTheme !== "light";

  useEffect(() => {
    if (failed) return;
    const thisRequest = ++requestId.current;
    let cancelled = false;

    loadHighlighter()
      .then((highlighter) => {
        if (cancelled || thisRequest !== requestId.current) return;
        const generated = highlighter.codeToHtml(code, {
          lang,
          theme: isDark ? THEMES.dark : THEMES.light,
        });
        setHtml(generated);
      })
      .catch(() => {
        // Never throw for a chat render — permanently fall back to plain
        // <pre> for this block rather than retrying a broken highlighter.
        if (!cancelled && thisRequest === requestId.current) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, lang, isDark, failed]);

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  async function handleCopy() {
    try {
      if (!navigator?.clipboard) return;
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can reject (permissions, insecure context) — not worth
      // surfacing as an error in a chat transcript.
    }
  }

  const showHighlighted = !failed && html;

  return (
    <div className="scroll-thin my-2 overflow-hidden rounded-md border border-border bg-surface-elevated/60 text-[0.8em]">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[0.75em] uppercase tracking-wide text-text-muted">
          {language?.trim() || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[0.75em] text-text-muted hover:text-text-primary",
            !reducedMotion && "transition-colors"
          )}
        >
          {copied ? (
            <>
              <Check className="size-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3" />
              Copy
            </>
          )}
        </button>
      </div>
      {showHighlighted ? (
        <div
          // Shiki's own generated markup from `code` — not model-authored
          // HTML — so this is the same trust boundary as any other
          // highlighter output, not a raw-HTML escape hatch for chat text.
          // `[&_pre]:!bg-transparent` neutralizes Shiki's inline background
          // so the container's own surface token shows through instead.
          className="scroll-thin overflow-x-auto p-3 leading-relaxed [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <PlainCode code={code} />
      )}
    </div>
  );
}

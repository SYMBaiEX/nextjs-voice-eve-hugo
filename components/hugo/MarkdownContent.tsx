"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/hugo/CodeBlock";
import { ChartBlock } from "@/components/hugo/rich/ChartBlock";
import { isRichBlockLang, parseRichBlock } from "@/lib/rich-blocks";

/**
 * MarkdownContent — renders a chat turn's text as actual formatted markdown
 * (bold, lists, tables, links, code, math) instead of literal `**`/`|`/`#`/`$`
 * characters, styled with the app's own design tokens rather than a generic
 * prose theme. Used by `HugoTranscript` for every turn, so chat, voice, and
 * the admin conversation viewer all get it from one place.
 *
 * No raw HTML support (no `rehype-raw`) — markdown syntax only. Model output
 * can incorporate arbitrary web content (e.g. search-result snippets), so
 * this is a deliberate safety default, not an oversight. `rehype-katex`
 * preserves that posture: it renders KaTeX's OWN trusted markup from
 * `remark-math` nodes, so the model's prose never passes through an HTML
 * parser — see `lib/rich-blocks.ts` for the same data-only philosophy applied
 * to `\`\`\`chart` blocks.
 *
 * Fenced code blocks are intercepted by the `pre` override: a recognized rich
 * language (e.g. `\`\`\`chart`) renders a real component (a chart), any other
 * fence renders a Shiki-highlighted `CodeBlock`. Both fail closed to plain
 * code on malformed/streaming-incomplete input.
 *
 * `remark-breaks` on top of `remark-gfm` so a single newline still renders as
 * a visible line break (plain CommonMark collapses it to a space) — matches
 * what a chat message actually looks like without requiring the model to
 * remember a trailing double-space or blank line for every break.
 */

/** Minimal hast shape we read off the `pre` node to recover the fenced code's
 *  language + raw text directly from the source tree (unaffected by the `code`
 *  component override, which only ever sees already-rendered children). */
interface HastNode {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

function getCodeChild(node: unknown): HastNode | null {
  const n = node as HastNode | undefined;
  return (
    n?.children?.find(
      (c) => c.type === "element" && c.tagName === "code",
    ) ?? null
  );
}

function hastLang(codeNode: HastNode): string {
  const cls = codeNode.properties?.className;
  const arr = Array.isArray(cls) ? cls : typeof cls === "string" ? [cls] : [];
  const langClass = arr.find(
    (c): c is string => typeof c === "string" && c.startsWith("language-"),
  );
  return langClass ? langClass.slice("language-".length) : "";
}

function hastText(codeNode: HastNode): string {
  let out = "";
  const walk = (n: HastNode) => {
    if (typeof n.value === "string") out += n.value;
    n.children?.forEach(walk);
  };
  codeNode.children?.forEach(walk);
  // hast code text carries a trailing newline; drop it so highlighted/parsed
  // output isn't padded with a blank final line.
  return out.replace(/\n$/, "");
}

const components: Components = {
  p: ({ children }) => (
    <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-hugo-cyan underline decoration-hugo-cyan/40 underline-offset-2 hover:decoration-hugo-cyan"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  // Inline code only — fenced/block code is intercepted by `pre` below, so
  // this override never fires for a block (its `<code>` child is read off the
  // hast node directly and rendered as a CodeBlock/ChartBlock instead).
  code: ({ children }) => (
    <code className="rounded bg-surface-elevated/80 px-1 py-0.5 font-mono text-[0.85em] text-text-primary">
      {children}
    </code>
  ),
  pre: ({ node, children }) => {
    const codeNode = getCodeChild(node);
    if (!codeNode) {
      // No code child (unexpected) — fall back to a plain preformatted block.
      return (
        <pre className="scroll-thin my-2 overflow-x-auto rounded-md border border-border bg-surface-elevated/60 p-3 leading-relaxed">
          {children}
        </pre>
      );
    }
    const lang = hastLang(codeNode);
    const raw = hastText(codeNode);

    // A recognized rich language renders a real component; if the JSON hasn't
    // finished streaming (or is malformed), fall through to a code block.
    if (isRichBlockLang(lang)) {
      const parsed = parseRichBlock(lang, raw);
      if (parsed.ok && parsed.kind === "chart") {
        return <ChartBlock spec={parsed.spec} />;
      }
    }
    return <CodeBlock code={raw} language={lang || undefined} />;
  },
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-hugo-cyan/40 pl-3 text-text-secondary italic">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => (
    <h1 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 mb-1 text-[0.95rem] font-semibold first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2.5 mb-1 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }) => (
    <div className="scroll-thin my-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-[0.85em]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-elevated/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-2 py-1 align-top">{children}</td>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-inherit">{children}</strong>
  ),
};

export function MarkdownContent({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

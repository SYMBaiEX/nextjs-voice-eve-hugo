"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

/**
 * MarkdownContent — renders a chat turn's text as actual formatted markdown
 * (bold, lists, tables, links, code) instead of literal `**`/`|`/`#`
 * characters, styled with the app's own design tokens rather than a generic
 * prose theme. Used by `HugoTranscript` for every turn, so chat, voice, and
 * the admin conversation viewer all get it from one place.
 *
 * No raw HTML support (no `rehype-raw`) — markdown syntax only. Model output
 * can incorporate arbitrary web content (e.g. search-result snippets), so
 * this is a deliberate safety default, not an oversight.
 *
 * `remark-breaks` on top of `remark-gfm` so a single newline still renders as
 * a visible line break (plain CommonMark collapses it to a space) — matches
 * what a chat message actually looks like without requiring the model to
 * remember a trailing double-space or blank line for every break.
 */

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
  code: ({ children, className }) => {
    // remark renders inline code without a language className; fenced code
    // blocks get one (e.g. "language-ts") even if unused for highlighting.
    const isBlock = !!className;
    return isBlock ? (
      <code className="font-mono text-[0.8em]">{children}</code>
    ) : (
      <code className="rounded bg-surface-elevated/80 px-1 py-0.5 font-mono text-[0.85em] text-text-primary">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="scroll-thin my-2 overflow-x-auto rounded-md border border-border bg-surface-elevated/60 p-3 leading-relaxed">
      {children}
    </pre>
  ),
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
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

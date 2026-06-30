"use client";

import { useCallback, useRef, useState } from "react";
import { useEveAgent } from "eve/react";
import { SendHorizontal, Square, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * EveChat — the Hugo Labs showcase, talking to the Eve durable runtime over its
 * HTTP channel via `useEveAgent` (eve/react). Unlike the main Hugo surface
 * (in-process AI SDK), every turn here runs on Eve's out-of-process agent loop
 * at `/eve/v1/*` (proxied by `withEve`). Same-origin + the app session cookie,
 * so no host or CORS wiring is needed.
 */

interface EvePart {
  type: string;
  text?: string;
  toolName?: string;
  state?: string;
}

interface EveMsg {
  id: string;
  role: string;
  parts: EvePart[];
}

function partText(parts: EvePart[]): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

function toolParts(parts: EvePart[]): EvePart[] {
  return parts.filter((p) => p.type === "dynamic-tool" || p.type === "tool-call");
}

export function EveChat() {
  const agent = useEveAgent();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = (agent.data?.messages ?? []) as unknown as EveMsg[];
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  const submit = useCallback(() => {
    const message = input.trim();
    if (!message || isBusy) return;
    setInput("");
    void agent.send({ message });
    textareaRef.current?.focus();
  }, [input, isBusy, agent]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Transcript */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Badge variant="blue" className="gap-1">
              <Wrench aria-hidden className="size-3" />
              Eve runtime
            </Badge>
            <h2 className="text-xl font-semibold text-text-primary">
              Hugo Labs
            </h2>
            <p className="max-w-md text-sm text-text-muted">
              A separate agent running on the Eve durable runtime, shown alongside
              Hugo. Ask for the time in a city, or a quick calculation — it runs
              the tools on Eve&rsquo;s out-of-process agent loop.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-2 py-4">
            {messages.map((m) => {
              const text = partText(m.parts);
              const tools = toolParts(m.parts);
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={cn("flex flex-col gap-1", isUser && "items-end")}
                >
                  <span className="px-1 font-mono text-[0.65rem] uppercase tracking-wider text-text-muted">
                    {isUser ? "You" : "Hugo Labs"}
                  </span>
                  {tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tools.map((t, i) => (
                        <Badge key={i} variant="muted" className="gap-1">
                          <Wrench aria-hidden className="size-3" />
                          {t.toolName ?? "tool"}
                          {t.state ? ` · ${t.state}` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {text && (
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                        isUser
                          ? "bg-hugo-cyan/15 text-text-primary"
                          : "bg-surface-elevated/60 text-text-primary",
                      )}
                    >
                      {text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex h-5 items-center gap-2 px-1" aria-live="polite">
        {isBusy && (
          <>
            <Spinner />
            <span className="font-mono text-xs text-text-muted">
              {agent.status === "submitted"
                ? "Hugo Labs is thinking…"
                : "Hugo Labs is responding…"}
            </span>
          </>
        )}
        {agent.status === "error" && !isBusy && (
          <span className="font-mono text-xs text-error">
            {agent.error?.message || "Something went wrong — try again."}
          </span>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 rounded-2xl border border-border bg-surface-elevated/50 p-2 backdrop-blur-sm focus-within:border-hugo-blue/40"
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Hugo Labs… (e.g. “what time is it in Tokyo?”)"
          aria-label="Message Hugo Labs"
          rows={1}
          className="min-h-10 max-h-40 flex-1 border-0 bg-transparent px-1.5 py-2 focus-visible:ring-0"
        />
        {isBusy ? (
          <Button
            type="button"
            variant="subtle"
            size="icon"
            onClick={() => agent.stop()}
            aria-label="Stop"
            className="shrink-0 rounded-full"
          >
            <Square aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            size="icon"
            disabled={!input.trim()}
            aria-label="Send message"
            className="shrink-0 rounded-full"
          >
            <SendHorizontal aria-hidden />
          </Button>
        )}
      </form>
    </div>
  );
}

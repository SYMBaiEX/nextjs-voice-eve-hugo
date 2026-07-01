import { defineDynamic, defineInstructions } from "eve/instructions";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { hugoToolContext } from "@/agent/lib/session-auth";

/**
 * Injects the signed-in user's durable memories into the system prompt —
 * mirrors `buildHugoSystemPrompt`'s `memories` block in the in-process runtime
 * (`lib/ai.ts`). Resolved at `turn.started` (turn-scoped, replaced each turn)
 * rather than `session.started`, so a fact saved mid-conversation via the
 * `save_user_preference` tool is visible on the very next turn, not just in a
 * future session.
 */
export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const hugoCtx = hugoToolContext(ctx);
      const memories = await fetchQuery(
        api.memories.listOwn,
        {},
        { token: hugoCtx.token },
      ).catch(() => [] as { key: string; value: string }[]);
      if (memories.length === 0) return null;

      const lines = memories
        .slice(0, 20)
        .map((m) => `- ${m.key}: ${m.value}`)
        .join("\n");

      return defineInstructions({
        markdown: `## What you remember about this user\nUse this only for the current user; never reference it for anyone else.\n${lines}`,
      });
    },
  },
});

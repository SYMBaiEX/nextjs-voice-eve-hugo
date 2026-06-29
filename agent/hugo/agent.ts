import { defineAgent } from "eve";

/**
 * Hugo agent definition (Eve authoring layer).
 *
 * This declares Hugo's durable identity the Eve way: a directory containing
 * `instructions.md`, `skills/`, `tools/`, and this `agent.ts`. The model is
 * resolved through the Vercel AI Gateway.
 *
 * Runtime note: Hugo is invoked **in-process** from the Next.js API routes via
 * AI SDK v7 (see lib/ai.ts), which forwards to this same gateway model. The
 * instructions and skills in this folder are assembled into the system prompt
 * there. To graduate to Eve's hosted durable runtime, wrap next.config with
 * `withEve` from `eve/next` and run `eve dev` — no changes to these files
 * required.
 */
export default defineAgent({
  model: process.env.DEFAULT_TEXT_MODEL ?? "minimax/minimax-m2.7",
  experimental: {
    workflow: {},
  },
});

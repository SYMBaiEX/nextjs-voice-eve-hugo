import { defineAgent } from "eve";

/**
 * Hugo Labs — a self-contained Eve agent that showcases the eve.dev durable
 * runtime alongside the main in-process Hugo assistant.
 *
 * Eve discovers this agent's instructions (`instructions.md`), skills
 * (`skills/`), and tools (`tools/*.ts`) from the filesystem; this file only
 * declares runtime config. The model routes through the Vercel AI Gateway, so
 * the eve runtime authenticates with the same AI_GATEWAY_API_KEY / OIDC the rest
 * of the app uses.
 */
export default defineAgent({
  model: process.env.DEFAULT_TEXT_MODEL ?? "anthropic/claude-sonnet-4.6",
});

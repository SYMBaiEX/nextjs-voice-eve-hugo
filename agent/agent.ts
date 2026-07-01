import { defineAgent } from "eve";

/**
 * Hugo's text-chat runtime, on the Eve durable agent runtime.
 *
 * Eve discovers this agent's instructions (`instructions.md` + dynamic
 * `instructions/`), skills (`skills/`), and tools (`tools/*.ts`, including the
 * dynamic admin set) from the filesystem; this file only declares runtime
 * config. `model` is a single static value for every session (a hard Eve
 * limitation — no per-request override exists), so this path serves users who
 * don't have their own AI Gateway key: the admin (server key) and keyless
 * non-admins (platform default). A user with their own key keeps using the
 * in-process AI SDK path instead (see `app/api/chat/route.ts`), so BYOK is
 * fully preserved. Voice never touches Eve — it has no realtime API.
 *
 * The model routes through the Vercel AI Gateway, authenticating with the same
 * AI_GATEWAY_API_KEY / OIDC the rest of the app uses (`lib/ai.ts`'s
 * `DEFAULT_TEXT_MODEL_ID`).
 */
export default defineAgent({
  model: process.env.DEFAULT_TEXT_MODEL ?? "minimax/minimax-m2.7",
});

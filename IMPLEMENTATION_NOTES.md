# Hugo — implementation notes

Production decisions made while building against the PRD. Where the PRD's
assumed June-2026 APIs differed from what is actually installable, the
production-safe choice is documented here.

## Stack (verified, installed latest)

- **Next.js 16.2.9** (App Router, RSC default, Turbopack), **React 19.2**, Node 22+, ESM.
- **AI SDK v7** (`ai@7`) + `@ai-sdk/react@4`, `@ai-sdk/gateway@4`, `@ai-sdk/openai@4`.
- **Vercel AI Gateway realtime voice** — the showcase. `experimental_useRealtime`
  (client) + `gateway.experimental_realtime.getToken` (server) are present in the
  **stable** packages, so no canary channel is required.
- **Eve** (`eve@0.17.1`, the real Vercel package — maintainers include rauchg).
- **Convex 1.42** + **Convex Auth** (`@convex-dev/auth`, Password provider).
- Tailwind v4, recharts v3 (React-19 compatible), next-themes, sonner, lucide.

## Key decisions

1. **Eve as the authoring layer, in-process runtime.** Eve's full runtime runs as
   a *separate proxied Vercel service* (`withEve` + `eve dev`/`eve build`). To keep
   Hugo a single, cleanly-deployable Next.js app with a green build, we use Eve's
   real `defineAgent` and the canonical `agent/hugo/` filesystem convention
   (`instructions.md`, `skills/`, `tools/`, `agent.ts`) and invoke Hugo **in-process**
   from the Next API routes via AI SDK v7 (`lib/ai.ts` assembles the prompt; tools
   are AI-SDK `tool()` definitions in `agent/hugo/tools/`). To graduate to Eve's
   hosted durable runtime later, wrap `next.config` with `withEve` and run `eve dev`
   — no changes to the agent files required.

2. **Auth: Convex Auth Password provider (self-contained).** No third-party keys.
   Roles are set in trusted backend code: `convex/auth.ts` `createOrUpdateUser`
   grants `admin` to `DEFAULT_ADMIN_EMAIL` (solsymbaiex@gmail.com) on account
   creation; every Convex function re-checks the role via `convex/model/authz.ts`.
   Admin routes are additionally gated server-side in `app/admin/layout.tsx` and by
   `proxy.ts` (Next 16's middleware replacement).

3. **Realtime security.** The browser never receives `AI_GATEWAY_API_KEY`. Flow:
   `POST /api/voice/session/start` (auth + daily-voice-limit) creates the
   conversation + voiceSession and returns ids; the client hook posts to
   `POST /api/realtime/token?session=ID` (auth + per-user rate limit) which mints a
   short-lived gateway token server-side and returns only `{ token, url }`. If the
   key is absent or minting fails, the route signals a graceful **fallback to text**.

4. **Local dev uses anonymous local Convex** (`CONVEX_AGENT_MODE=anonymous`),
   configured in `.env.local`. Auth JWT keys + `SITE_URL` were set on the deployment
   via `npx @convex-dev/auth`. For cloud, run `npx convex dev` to link a project and
   re-run the auth initializer, then set `AI_GATEWAY_API_KEY` in Convex + Vercel.

5. **Usage/cost numbers are display estimates** (`convex/model/usage.ts`); AI Gateway
   is the authoritative source of spend. Telemetry (`lib/telemetry.ts`) redacts
   secrets and only records prompts when `HUGO_RECORD_PROMPTS=true` (admin debugging).

## Running locally

```bash
pnpm install
# Terminal 1 — local Convex backend (anonymous):
CONVEX_AGENT_MODE=anonymous npx convex dev
# Terminal 2 — Next.js:
pnpm dev
```

Set `AI_GATEWAY_API_KEY` in `.env.local` (and in the Convex deployment env if AI is
called from Convex) to enable real voice + chat. Without it, the UI runs and
gracefully reports that AI is not configured. Sign up with `solsymbaiex@gmail.com`
to land as admin. Seed demo dashboard data with `npx convex run seed:seedDemoData`
while signed in as that admin (or from the Convex dashboard).

## Tests

`pnpm test` (vitest + convex-test): unauthenticated/cross-user Convex authorization,
public-settings access, route input validation, and pure helpers (permissions,
usage limits, tool registry client-safe projection).

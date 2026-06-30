<div align="center">

# Hugo

### A production-grade, open-source realtime AI voice assistant — an ambient command orb built on the Vercel-native AI stack.

[![CI](https://img.shields.io/badge/CI-pending-555.svg?style=flat-square)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg?style=flat-square)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000.svg?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19.2-149eca.svg?style=flat-square&logo=react)](https://react.dev)
[![Convex](https://img.shields.io/badge/Convex-realtime%20DB-f3502c.svg?style=flat-square)](https://convex.dev)
[![Vercel](https://img.shields.io/badge/Deploys%20on-Vercel-000.svg?style=flat-square&logo=vercel)](https://vercel.com)
[![AI SDK v7](https://img.shields.io/badge/AI%20SDK-v7-000.svg?style=flat-square)](https://ai-sdk.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

</div>

---

## What is Hugo

Hugo is a realtime AI voice agent you can talk to — speak naturally, interrupt freely, and continue the same conversation in text. Under the hood it is a complete showcase of the modern Vercel AI stack: realtime voice over the **Vercel AI Gateway**, an agent authored with **Eve** (Vercel's filesystem-first agent framework), realtime data and auth in **Convex**, all wrapped in a **Next.js 16** App Router app with React Server Components.

It ships with everything a real product needs: streaming voice and text, conversation history, per-user memory, usage and cost tracking with daily limits, a full 9-page admin dashboard, telemetry with secret redaction, strict per-user authorization, and an audio-reactive Anime.js "command orb" with runtime and reserved visual states.

## Demo

> **Screenshots / demo coming soon.**
>
> - **The orb** (`/`) — the audio-reactive Hugo command orb. Click to start a realtime voice session; watch it move through `idle → connecting → listening → speaking/error` with barge-in support.
> - **Chat** (`/chat`) — streaming text chat with the same agent, full conversation persistence.
> - **Admin** (`/admin`) — the 9-page operator dashboard: users, conversations, voice sessions, usage/cost, agent events, tool calls, settings, and audit logs.

---

## Features

### Voice
- Realtime, low-latency voice via the **Vercel AI Gateway** (`experimental_useRealtime` on the client, server-minted tokens on the server).
- Server-side VAD (voice activity detection) and **barge-in** — interrupt Hugo mid-sentence.
- Finalized voice transcript turns persist to the conversation ledger; voice usage is metered server-side from session duration.
- Graceful **fallback to text** when AI is not configured or token minting fails.
- Audio-reactive **Anime.js orb** with active runtime states plus reserved visual states (`idle`, `auth_required`, `connecting`, `listening`, `thinking`, `speaking`, `interrupted`, `tool_running`, `error`, `sleeping`), honoring `prefers-reduced-motion`.

### Chat
- Streaming text chat backed by the same Hugo agent (AI SDK v7).
- Full conversation history with summaries, browseable and searchable per user.

### Memory
- Durable per-user memory (preferences, profile facts, projects, instructions) the agent can read and write through safe tools.
- Recent-conversation recall to ground replies in context.

### Admin
- A full **9-page dashboard**: users, conversations, voice sessions, usage, agent events, tool calls, settings, audit logs, plus an overview.
- Usage and cost estimates with recharts, runtime-configurable model/voice settings, and an immutable audit trail of every admin mutation.

### Security
- All authorization is enforced **server-side in Convex** — the client `userId` is never trusted.
- The AI Gateway key **never reaches the browser**; the client only ever receives short-lived realtime tokens.
- Per-user data isolation, daily usage limits, per-user rate limiting on token minting and realtime tool execution, short-lived session-bound tool grants, and secret redaction in telemetry and tool I/O.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, RSC, Turbopack, `proxy.ts`), [React 19.2](https://react.dev) |
| Language | [TypeScript](https://www.typescriptlang.org) (strict), ESM, Node 22+ |
| AI SDK | [Vercel AI SDK v7](https://ai-sdk.dev) — `ai@7`, `@ai-sdk/react`, `@ai-sdk/gateway`, `@ai-sdk/openai` |
| Realtime voice | [Vercel AI Gateway](https://vercel.com/ai-gateway) realtime — `experimental_useRealtime` + server-minted tokens |
| Agent framework | [Eve](https://www.npmjs.com/package/eve) `eve@0.17.x` (authoring layer: `agent/hugo/`) |
| Backend & auth | [Convex](https://convex.dev) + [Convex Auth](https://labs.convex.dev/auth) (Password provider) |
| UI & motion | [Tailwind v4](https://tailwindcss.com), [Anime.js v4](https://animejs.com), [recharts](https://recharts.org), [next-themes](https://github.com/pacocoursey/next-themes), [sonner](https://sonner.emilkowal.ski), [lucide-react](https://lucide.dev) |
| Testing | [Vitest](https://vitest.dev) + [convex-test](https://github.com/get-convex/convex-test) |

---

## Architecture overview

```
Browser (React 19, the Hugo orb)
   │  experimental_useRealtime (audio in/out)        useChat (streaming text)
   ▼                                                   ▼
Next.js 16 App Router  ──────────────────────────────────────────────
   • proxy.ts            route-level auth gate (Convex Auth)
   • /api/voice/session  start/end a voice session (auth + daily limit)
   • /api/realtime/token mints a SHORT-LIVED gateway token (key stays server-side)
   • /api/realtime/tool  executes server-side tools with a short-lived session grant
   • /api/chat           streams the agent's text reply
   • /api/agent/hugo     in-process Hugo agent run (AI SDK v7)
   ▼
Eve agent layer (agent/hugo/)
   • instructions.md + skills/ → assembled into the system prompt (lib/ai.ts)
   • tools/ → AI-SDK tool() defs, executed against Convex with the user's JWT
   ▼
Convex (realtime DB + auth)
   • per-user authorization in convex/model/authz.ts (requireUser / requireAdmin)
   • conversations, messages, voiceSessions, memories, usage, tool calls, audit logs
   ▼
Vercel AI Gateway → model (realtime voice + text)
```

The browser talks to Next.js Route Handlers for application state and tool execution. Route Handlers carry the authenticated user's Convex JWT into every backend call, so Convex enforces the same per-user authorization everywhere. The realtime token route mints a short-lived gateway token server-side, returns a client-safe setup envelope, and sets an HttpOnly same-site grant cookie used only for realtime tool callbacks — the gateway key stays on the server.

### Why Eve / why in-process

Hugo uses Eve as the **authoring layer** — the canonical `agent/hugo/` directory (`instructions.md`, `skills/`, `tools/`, `agent.ts` via `defineAgent`) — but invokes the agent **in-process** from Next.js Route Handlers via AI SDK v7. This keeps Hugo a single, cleanly-deployable Next.js app with a green build, while the agent files stay portable: to graduate to Eve's hosted durable runtime later, wrap `next.config` with `withEve` and run `eve dev` — no changes to the agent files required. See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for the full rationale.

---

## Getting Started

### Prerequisites

- **Node.js 22+**
- **pnpm** (`npm i -g pnpm`)
- A [Convex](https://convex.dev) account (optional — local anonymous mode works without one)
- A [Vercel AI Gateway](https://vercel.com/ai-gateway) key (optional — the app runs without AI, gracefully reporting it is not configured)

### Setup

```bash
# 1. Clone
git clone https://github.com/SYMBaiEX/nextjs-voice-eve-hugo.git
cd nextjs-voice-eve-hugo

# 2. Install
pnpm install

# 3. Environment
cp .env.example .env.local
# (.env.local is gitignored — fill in values, never commit real secrets)

# 4. Convex backend — pick ONE:
#    a) Local anonymous (no account needed):
CONVEX_AGENT_MODE=anonymous npx convex dev
#    b) Cloud (links a project under your Convex account):
npx convex dev

# 5. Auth keys (generates JWT private key + JWKS on the deployment)
npx @convex-dev/auth

# 6. Run the app (in a second terminal)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up with `solsymbaiex@gmail.com` to land as **admin**.

### Enabling AI

Realtime voice and text chat require a Vercel AI Gateway key. Add it to `.env.local`:

```bash
AI_GATEWAY_API_KEY=your-gateway-key
```

In production on Vercel, OIDC auth means **no key is needed** — the gateway authenticates the deployment automatically, and the admin health check uses the same runtime detection. Without a key locally, the UI still runs and gracefully reports that AI is not configured.

### Seed demo data (optional)

While signed in as the admin, populate the dashboards with sample data:

```bash
npx convex run seed:seedDemoData
```

---

## Environment variables

All real values live only in `.env.local` (gitignored). `.env.example` holds blank placeholders. Variables prefixed `NEXT_PUBLIC_` are exposed to the browser — **never put a secret behind that prefix.**

| Variable | Public? | Description |
| --- | :---: | --- |
| `NEXT_PUBLIC_APP_URL` | ✅ | Base URL of the app (e.g. `http://localhost:3000`). |
| `NEXT_PUBLIC_CONVEX_URL` | ✅ | Convex deployment URL (set automatically by `npx convex dev`). |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | ✅ | Convex HTTP actions site URL (set automatically). |
| `CONVEX_DEPLOYMENT` | — | Convex deployment identifier (set automatically). |
| `AI_GATEWAY_API_KEY` | — | **Server only.** Vercel AI Gateway key for realtime voice + text. Never exposed to the browser. Not needed in prod when using Vercel OIDC. |
| `DEFAULT_ADMIN_EMAIL` | — | Email auto-granted the `admin` role on first sign-in. Default `solsymbaiex@gmail.com`. |
| `DEFAULT_REALTIME_MODEL` | — | Default realtime voice model (e.g. `openai/gpt-realtime-2`). Admin-configurable at runtime. |
| `DEFAULT_TEXT_MODEL` | — | Default text model (e.g. `openai/gpt-5.5`). Admin-configurable at runtime. |
| `DEFAULT_VOICE` | — | Default voice (e.g. `alloy`). |
| `ENABLE_GUEST_PREVIEW` | — | Allow a guest preview of the live experience. `false` by default. |
| `DAILY_VOICE_MINUTES_LIMIT` | — | Per-user daily voice minutes cap (default `30`). |
| `DAILY_TEXT_MESSAGES_LIMIT` | — | Per-user daily text messages cap (default `200`). |
| `HUGO_RECORD_PROMPTS` | — | When `true`, records prompts/outputs for admin debugging only. Off by default. |

> Some values (`CONVEX_SITE_URL` and `JWT_PRIVATE_KEY` / `JWKS`) are set on the **Convex deployment** via `npx convex env set` / `npx @convex-dev/auth`, not in `.env.local`. The current AI runtime calls Gateway from Next.js Route Handlers, so `AI_GATEWAY_API_KEY` belongs in `.env.local`/Vercel env unless you later move AI calls into Convex actions.

---

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start Next.js (Turbopack) dev server. |
| `pnpm dev:all` | Run Convex once, then start Next.js. |
| `pnpm build` | Production build. |
| `pnpm start` | Serve the production build. |
| `pnpm lint` | Run ESLint. |
| `pnpm typecheck` | `tsc --noEmit` (strict). |
| `pnpm convex` | Start the Convex dev backend. |
| `pnpm convex:codegen` | Regenerate Convex types (`convex/_generated`). |
| `pnpm convex:deploy` | Deploy Convex functions to the cloud. |
| `pnpm test` | Run the Vitest suite once. |
| `pnpm test:watch` | Run Vitest in watch mode. |

---

## Deploying

Hugo deploys to **Vercel** (frontend + Route Handlers) with **Convex Cloud** as the backend.

1. **Provision Convex.** Run `npx convex deploy` (or `pnpm convex:deploy`) to push functions to a production deployment. Set deployment env on Convex: `CONVEX_SITE_URL` and auth keys via `npx @convex-dev/auth`.
2. **Set Vercel env vars.** Add `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_APP_URL`, and the model/limit defaults. With **Vercel OIDC**, no gateway key is required for the AI Gateway in production.
3. **Deploy the frontend.** `vercel deploy --prod`, or connect the GitHub repo to a Vercel project for **automatic deploys** on every push to `main`.

The production target is `hugo.vercel.app` backed by a Convex Cloud deployment.

---

## Admin

The first account that signs in with `DEFAULT_ADMIN_EMAIL` (default `solsymbaiex@gmail.com`) is granted the `admin` role automatically. Roles are simple: `user` and `admin`.

- The role is set in **trusted backend code** (`convex/auth.ts` `createOrUpdateUser`) and can never be spoofed from the client.
- Every admin Convex function re-checks the role via `requireAdmin` in `convex/model/authz.ts`.
- Admin routes are additionally gated server-side in `app/admin/layout.tsx` and by `proxy.ts`.
- Every admin mutation appends an immutable entry to the audit log.

---

## Project structure

```
hugo/
├─ app/                       # Next.js App Router
│  ├─ admin/                  # 9-page admin dashboard (RSC + client islands)
│  ├─ api/                    # Route Handlers (chat, realtime token, voice session, agent)
│  ├─ chat/  conversations/  settings/  sign-in/  sign-up/
│  ├─ layout.tsx  page.tsx    # root layout + the orb landing page
│  └─ globals.css             # Tailwind v4 + the Hugo design system tokens
├─ components/
│  ├─ hugo/                   # the orb, voice/chat panels, transcript, console
│  ├─ admin/                  # data tables, charts, metric cards, nav
│  ├─ landing/ layout/ providers/ motion/ ui/
├─ convex/                    # backend
│  ├─ model/authz.ts          # the per-user authorization invariant
│  ├─ schema.ts               # users, conversations, messages, voiceSessions, …
│  ├─ auth.ts  auth.config.ts # Convex Auth (Password) + role grant
│  ├─ conversations.ts  messages.ts  memories.ts  voiceSessions.ts
│  ├─ usageEvents.ts  toolCalls.ts  agentEvents.ts  admin.ts  settings.ts  seed.ts
│  └─ tests/                  # authorization + permissions tests
├─ agent/hugo/                # Eve authoring layer
│  ├─ agent.ts                # defineAgent(...)
│  ├─ instructions.md         # system prompt
│  ├─ skills/                 # markdown skills assembled into the prompt
│  └─ tools/                  # AI-SDK tool() definitions + registry
├─ lib/                       # ai.ts, convex-server.ts, permissions, rate-limit, telemetry, …
├─ hooks/                     # useHugoRealtime.ts
├─ proxy.ts                   # Next 16 middleware (route-level auth)
└─ test/                      # vitest unit tests
```

---

## Testing

```bash
pnpm test         # run once
pnpm test:watch   # watch mode
```

The suite (Vitest + `convex-test`) covers: unauthenticated and cross-user Convex authorization, public-settings access, Route Handler input validation, and pure helpers (permissions, usage limits, the client-safe tool-registry projection).

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, branch/PR conventions, code style (TS strict, ESLint, the Convex authz invariant), where to add tools and skills, and the CI checks that must pass before a PR is merged.

---

## Security

Hugo never stores real secrets in the repo — `.env.local` is gitignored and `.env.example` holds blank placeholders only. To report a vulnerability, see [SECURITY.md](./SECURITY.md). Please report privately rather than opening a public issue.

---

## License

[MIT](./LICENSE) © 2026 SYMBaiEX

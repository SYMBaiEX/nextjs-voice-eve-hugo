# AGENTS.md

Guidance for AI coding agents (and humans) working in the Hugo repository. Read this before writing code.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This project uses **Next.js 16**, which has breaking changes — APIs, conventions, and file structure may differ from your training data. Notably, middleware is now `proxy.ts` (not `middleware.ts`). Before writing Next.js code, check the official docs at <https://nextjs.org/docs> and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What Hugo is

A realtime AI voice assistant (the "command orb") and a showcase of the Vercel-native AI stack: Next.js 16 + React 19, AI SDK v7, Vercel AI Gateway realtime voice, the Eve agent framework, and Convex (DB + auth). See [README.md](./README.md) for the product overview and [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for architecture decisions.

## Before you commit — always run

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All three must pass. If you touched Convex functions, also run `pnpm convex:codegen` and commit the generated changes. `pnpm build` must also succeed.

## Two agent stacks (in-process Hugo + the Eve showcase)

Hugo runs as **two** distinct agent stacks in one app:

### 1. The in-process Hugo agent (`hugo-agent/`) — voice + text

The primary assistant. Authored the **Eve way** (filesystem-first: `instructions.md`, `skills/`, `tools/`) but invoked **in-process** from Next.js Route Handlers via AI SDK v7 (`lib/ai.ts` assembles the system prompt; `/api/chat` streams, voice uses AI Gateway realtime tokens). Both voice and text share this one definition.

- **Instructions:** `hugo-agent/instructions.md` is Hugo's core system prompt.
- **Skills:** add a focused Markdown file to `hugo-agent/skills/`.
- **Tools:** add an AI-SDK `tool()` in `hugo-agent/tools/index.ts`. Tools execute against Convex with the authenticated user's token, wrap `execute` in `logged(...)`, and `redact(...)` sensitive I/O. Keep the client-safe projection in `hugo-agent/tools/registry.ts` in sync.

### 2. The Eve runtime showcase (`agent/`) — text-only, at `/eve`

"Hugo Labs" runs on the real **Eve durable runtime** (`eve@0.17.x`), wired via `withEve(nextConfig)` in `next.config.ts`. Eve is **out-of-process**: in dev a co-located `eve dev` server boots beside Next; on Vercel it co-deploys behind the web app, serving `/eve/v1/*` (rewritten by `withEve`). The `/eve` page talks to it with `useEveAgent` (`eve/react`).

- Flat layout: `agent/agent.ts` (`defineAgent`), `agent/instructions.md`, `agent/tools/*.ts` (`defineTool`, filename = tool name), `agent/channels/eve.ts`.
- **Safety:** every dangerous default-harness tool (`bash`, `read_file`, `write_file`, `glob`, `grep`, `web_fetch`, `web_search`) is disabled via `disableTool()` files; only the safe demo tools remain. Access is gated in `proxy.ts` (Convex auth on `/eve/v1/*`), so the channel uses `none()`.
- Eve has **no realtime/voice support** — voice stays on the in-process stack. Requires Node ≥ 24. Build artifacts (`.eve/`, `.output/`, `.workflow-data/`) are gitignored.

## The Convex authorization invariant (non-negotiable)

> **Never trust a client-supplied `userId`. Every Convex function that touches user-owned data must resolve identity through `convex/model/authz.ts`.**

- `requireUser(ctx)` — authenticated, active user.
- `requireAdmin(ctx)` — authenticated admin.
- `assertOwnerOrAdmin(user, ownerId)` / `canAccess(user, ownerId)` — per-resource checks.
- `logAudit(ctx, ...)` — call from every admin mutation (immutable audit trail).

Derive identity from the authenticated context, then check ownership — do not read a `userId` from args to decide access. Roles are set only in trusted backend code (`convex/auth.ts`), never from the client. Add a test under `convex/tests/` for unauthenticated and cross-user cases.

## Client / server boundary rules

- **Server-only modules** import `"server-only"` (e.g. `lib/convex-server.ts`, `agent/hugo/tools/index.ts`). Never import them — or any secret — into a `"use client"` component.
- **Keep shared, stateless helpers in non-client modules** so both RSC and client code can call them. Example: `buttonVariants` lives in `components/ui/button-variants.ts` (a non-client module), not in the `"use client"` button component, so server components can style a `<Link>` like a button.
- Route Handlers carry the user's Convex JWT into backend calls so authorization is enforced everywhere. The AI Gateway key never reaches the browser — realtime uses short-lived, server-minted tokens.
- Only `NEXT_PUBLIC_*` values are safe on the client. Never expose a secret through that prefix.

## Design system tokens

Use the CSS variables / Tailwind tokens from `app/globals.css` rather than hard-coded colors:

- Surfaces: `--background`, `--surface`, `--surface-elevated`, `--border`, `--border-strong`.
- Text: `--text-primary`, `--text-secondary`, `--text-muted`.
- Accents: `--hugo-cyan`, `--hugo-blue`, `--accent-magenta`; status: `--success`, `--warning`, `--error`.
- The app is **dark-first** (light mode is supported, secondary). The orb's 10 states and motion live in `components/hugo/HugoOrb.tsx` (Anime.js v4) and honor `prefers-reduced-motion`. JS-side colors that must match the CSS live in `lib/constants.ts` (`PALETTE`).

## Conventions

- TypeScript strict, ESM, Node 22+. Use the `@/*` path alias.
- Conventional Commits (`feat:`, `fix:`, `docs:`, …). Branch off `main`.
- No secrets in tracked files. `.env.local` is gitignored; `.env.example` holds placeholders only.
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow and [SECURITY.md](./SECURITY.md) for the security posture.


<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37777
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>
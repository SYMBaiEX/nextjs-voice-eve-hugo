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

## The Eve agent layer (`agent/hugo/`)

Hugo is authored the **Eve** way (a filesystem-first agent: `instructions.md`, `skills/`, `tools/`, `agent.ts` via `defineAgent`), but invoked **in-process** from Next.js Route Handlers via AI SDK v7 (`lib/ai.ts` assembles the system prompt from `instructions.md` + `skills/`). This keeps Hugo a single, cleanly-deployable Next app.

- **Instructions:** `agent/hugo/instructions.md` is Hugo's core system prompt.
- **Skills:** add a focused Markdown file to `agent/hugo/skills/`; it is assembled into the prompt.
- **Tools:** add an AI-SDK `tool()` in `agent/hugo/tools/index.ts`. Tools execute against Convex with the authenticated user's token, wrap `execute` in the existing `logged(...)` helper (records to the `toolCalls` ledger), and `redact(...)` sensitive I/O. Keep the client-safe projection in `agent/hugo/tools/registry.ts` in sync.

To graduate to Eve's hosted durable runtime later: wrap `next.config` with `withEve` and run `eve dev` — no changes to the agent files required.

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

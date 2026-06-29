# Contributing to Hugo

Thanks for your interest in improving Hugo. This guide covers local setup, conventions, and the checks your PR must pass. Hugo is a public, MIT-licensed showcase of the Vercel-native AI stack — keep contributions clean, typed, and secret-free.

## Code of conduct

Be respectful and constructive. Assume good faith. Harassment of any kind is not tolerated.

## Local setup

Prerequisites: **Node.js 22+** and **pnpm**.

```bash
git clone https://github.com/SYMBaiEX/nextjs-voice-eve-hugo.git
cd nextjs-voice-eve-hugo
pnpm install
cp .env.example .env.local            # gitignored — never commit real values

# Convex backend (local anonymous, no account required):
CONVEX_AGENT_MODE=anonymous npx convex dev
# Auth keys (one-time):
npx @convex-dev/auth

# In a second terminal:
pnpm dev
```

Open http://localhost:3000 and sign up with `solsymbaiex@gmail.com` to land as admin. See [README.md](./README.md) for full details and [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for architecture decisions.

> **Never commit secrets.** `.env.local` is gitignored. `.env.example` holds blank placeholders only. Do not paste real keys, tokens, or deployment URLs into any tracked file, commit message, or PR description.

## Branch & PR conventions

- Branch off `main`. Use a descriptive prefix: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/` (e.g. `feat/voice-barge-in-indicator`).
- Keep PRs focused and reasonably small; one logical change per PR.
- Fill in what changed and why. Link any related issue.
- Do not open a PR for a security vulnerability — see [SECURITY.md](./SECURITY.md) and report privately.

### Before you open a PR

Run all three locally and make sure they pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

If you changed Convex functions, also regenerate types with `pnpm convex:codegen` and commit the result.

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org):

```
type(scope): short imperative summary

feat(voice): add reconnect backoff to realtime hook
fix(admin): gate usage page behind requireAdmin
docs(readme): document the env var table
test(authz): cover cross-user conversation access
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.

## Code style

- **TypeScript strict.** No `any` escape hatches without a clear, commented reason. Prefer precise types and `zod` schemas at boundaries.
- **ESLint** (`eslint-config-next` core-web-vitals + typescript). `pnpm lint` must be clean. Do not edit `convex/_generated/**` (it is generated and ignored).
- **ESM + Node 22+.** Use the `@/*` path alias for imports.
- **Server vs client boundaries.** Server-only modules import `"server-only"` (see `lib/convex-server.ts`, `agent/hugo/tools/index.ts`). Never import a server-only module or a secret into a `"use client"` component. Keep shared, non-stateful helpers (e.g. `components/ui/button-variants.ts`) in non-client modules so both RSC and client code can use them.
- **Design tokens.** Use the CSS variables and Tailwind tokens defined in `app/globals.css` (`--hugo-cyan`, `--text-primary`, `--surface-elevated`, etc.) rather than hard-coded colors.
- **No secrets in `NEXT_PUBLIC_*`.** Anything prefixed `NEXT_PUBLIC_` is shipped to the browser.

## The Convex authorization invariant

This is the single most important rule in the codebase:

> **Every Convex function that touches user-owned data must resolve identity through `convex/model/authz.ts` — never trust a `userId` passed from the client.**

Use the helpers:

- `requireUser(ctx)` — require an authenticated, active (non-disabled) user.
- `requireAdmin(ctx)` — require an authenticated admin.
- `assertOwnerOrAdmin(user, ownerId)` / `canAccess(user, ownerId)` — per-resource access checks.
- `logAudit(ctx, ...)` — append an immutable audit log entry from every admin mutation.

### Adding a Convex function

1. Add the `query` / `mutation` / `action` in the relevant `convex/*.ts` module.
2. Validate args with Convex validators.
3. **First line of business logic:** call `requireUser(ctx)` or `requireAdmin(ctx)`. Never read a `userId` from args to decide ownership — derive identity from the authenticated context, then check ownership with `assertOwnerOrAdmin`.
4. For admin mutations, call `logAudit(...)`.
5. Add a test under `convex/tests/` covering the unauthenticated and cross-user cases.
6. Run `pnpm convex:codegen` and commit `convex/_generated` changes.

## Adding agent tools and skills

The Hugo agent lives in `agent/hugo/` (the Eve authoring layer):

- **Skills** — drop a Markdown file in `agent/hugo/skills/`. It is assembled into the system prompt. Keep skills focused and behavioral.
- **Instructions** — `agent/hugo/instructions.md` is Hugo's core system prompt.
- **Tools** — add an AI-SDK `tool()` definition in `agent/hugo/tools/index.ts`. Tools run against Convex with the authenticated user's token, so authorization is enforced server-side and a tool can never reach another user's data. Wrap the `execute` fn with the existing `logged(...)` helper so each call is recorded to the `toolCalls` ledger, and use `redact(...)` on any I/O that could contain sensitive keys.
- Keep the client-safe tool registry projection (`agent/hugo/tools/registry.ts`) in sync, and add a test if you add a tool.

## CI checks

All PRs must pass:

- `pnpm lint` — ESLint clean.
- `pnpm typecheck` — `tsc --noEmit` with strict mode.
- `pnpm test` — the full Vitest + convex-test suite.
- `pnpm build` — the production build must succeed.

A green build and green tests are required before review.

## License

By contributing, you agree your contributions are licensed under the project's [MIT License](./LICENSE).

# Security Policy

Hugo is a public, open-source project that handles realtime voice, user data, and AI credentials. We take security seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately by email to **solsymbaiex@gmail.com** with:

- A clear description of the vulnerability and its impact.
- Steps to reproduce (proof-of-concept, affected routes/functions, or a minimal repro).
- The affected version / commit, and any relevant environment details.

You will receive an acknowledgement as soon as is reasonably possible. We will work with you to confirm the issue, develop a fix, and coordinate disclosure.

## Responsible disclosure expectations

- Give us a reasonable amount of time to investigate and patch before any public disclosure.
- Do not access, modify, or exfiltrate data that is not yours, and do not run attacks that degrade service for other users (no DoS, no spam, no social engineering).
- Act in good faith. Good-faith research conducted under this policy is welcome, and we will not pursue action against researchers who follow it.

## Scope

In scope:

- The application code in this repository: Next.js Route Handlers (`app/api/**`), the `proxy.ts` route gate, Convex functions (`convex/**`), the Hugo agent layer (`agent/hugo/**`), and shared `lib/**` helpers.
- Authentication and authorization logic, per-user data isolation, realtime token minting, rate limiting, and secret handling.

Out of scope:

- Third-party platforms and their infrastructure (Vercel, Convex, the AI Gateway and upstream model providers) — report those to the respective vendors.
- Vulnerabilities requiring a compromised admin account, physical access, or a modified client.
- Findings that depend on running with real secrets the project never ships (the repo contains placeholders only).

## Security posture

Hugo is built defense-in-depth:

- **Server-side authorization.** All access control is enforced in Convex via `convex/model/authz.ts` (`requireUser`, `requireAdmin`, `assertOwnerOrAdmin`). The client-supplied `userId` is never trusted — identity is always derived from the authenticated context.
- **Route boundaries.** `proxy.ts` (Next 16 middleware) is a first gate that redirects unauthenticated users from protected routes; admin routes are additionally gated server-side in `app/admin/layout.tsx` and re-checked in every admin Convex function.
- **The gateway key never reaches the browser.** Realtime voice uses **short-lived, server-minted tokens**: the client posts to `/api/realtime/token`, the server mints a brief gateway token and returns only `{ token, url }`. In production, Vercel OIDC authenticates the deployment so no key is stored at all.
- **Per-user isolation.** Conversations, messages, voice sessions, memories, and usage are all owned and access-checked per user; tools execute against Convex with the user's JWT and cannot reach another user's data.
- **Rate limits & usage caps.** Realtime token minting is rate-limited per user, and per-user daily voice-minute and text-message limits are enforced server-side.
- **Audit logs.** Every admin mutation appends an immutable entry to the audit log.
- **Secret redaction in telemetry.** Telemetry and tool I/O redact obviously-sensitive keys (`token`, `secret`, `password`, `key`, `authorization`). Prompts/outputs are only recorded when `HUGO_RECORD_PROMPTS=true` (admin debugging), off by default.
- **No secrets in the repo.** `.env.local` is gitignored; `.env.example` contains blank placeholders only. Never commit real keys, tokens, or deployment URLs.

## Supported versions

This is an actively developed showcase project; security fixes target the latest `main`. Please verify a finding against the current `main` before reporting.

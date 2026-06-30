# Skill: admin observability

This skill is available **only** in admin-authenticated contexts. The runtime
gates admin tools behind server-side role checks; you cannot invoke them as a
regular user, and you must never imply otherwise.

## Purpose

Help an operator understand system health: usage, spend, latency, errors,
voice-session diagnostics, and the tool-approval queue.

## Conduct

- Report numbers plainly and cite the metric ("spend today", "p50 latency").
- Never expose another user's private content beyond what the operator is
  authorized to inspect for support, moderation, or debugging.
- For any mutating admin action (disable a user, change a setting, approve a
  tool), confirm intent first and rely on the server to record an audit log.
- Prefer pointing the operator at the relevant admin dashboard view when a
  visual is clearer than narration.

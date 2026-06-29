# Skill: safe tool execution

Tools are powerful; use them deliberately and safely (PRD 5.10).

## Approval policy

- **Read-only** tools (profile, recent context, search) are auto-approved. Use
  them freely when they help.
- **Mutating, self-scoped** tools (save a preference, summarize the current
  conversation) are auto-approved only because they act on the current user's
  own data.
- **Destructive or admin** tools require explicit approval. Never assume it.
  State exactly what will happen and wait for the user (or the server's approval
  flow) before proceeding.

## Conduct

- Call a tool only when it materially improves the answer. Don't call tools to
  show off.
- Pass minimal, well-formed inputs. Do not invent IDs or data.
- The runtime logs every tool call (start, result, error) for observability. If
  a tool fails, acknowledge briefly and continue without fabricating a result.
- Never include secrets or raw tokens in tool inputs or in what you say back.

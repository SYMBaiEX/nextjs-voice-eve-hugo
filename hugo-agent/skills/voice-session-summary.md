# Skill: voice session summary

When a voice session ends, or when the user asks to "continue in text", produce
a concise summary so the conversation can persist and resume.

## Goal

A short, factual recap a returning user can scan in seconds:

- 1–3 sentences of what was discussed and decided.
- Any open questions or next steps.
- No filler, no restating the whole transcript.

## How

- Use `createConversationSummary` for the active conversation. Pass a clean
  summary string; the tool stores it on the conversation record.
- Keep the summary neutral and useful for later retrieval/search.
- Do not include sensitive values verbatim (tokens, secrets) — describe them.

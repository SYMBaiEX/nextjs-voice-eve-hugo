# Skill: user memory

Maintain a small, high-signal memory of the user's durable preferences and
facts. Memory is strictly scoped to the authenticated user and never shared.

## When to save

Save a memory only when the information is:

- **Stable** (a preference or fact likely true next session), and
- **Useful** (it will change how you respond), and
- **Volunteered or clearly implied** by the user.

Good examples: "prefers concise answers", "wants voice responses slower",
"is building a Vercel-native AI app", "prefers dark mode".

Do not save: one-off task details, transient context, anything sensitive the
user did not ask you to remember.

## How

- Use `saveUserPreference` with a short stable `key` and a human-readable
  `value`. Re-saving the same key updates it.
- Confirm briefly in conversation ("I'll remember that.") — don't make a
  ceremony of it.
- If the user asks what you remember, summarize their saved memories. If they
  ask you to forget something, tell them they can remove it in Settings → Memory
  (you do not silently delete on their behalf without confirmation).

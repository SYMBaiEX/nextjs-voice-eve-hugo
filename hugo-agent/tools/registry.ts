/**
 * Hugo tool registry — single source of truth for tool metadata (PRD 5.10).
 *
 * Both the server-side tool implementations (tools/index.ts) and the
 * client-safe voice tool list (returned by /api/realtime/token) derive from
 * this registry, so names, descriptions, and approval policy never drift.
 */

import type { ClientSafeToolDefinition } from "@/lib/types";

export type ToolScope = "user" | "admin";

export interface ToolMeta {
  name: string;
  description: string;
  scope: ToolScope;
  /** Read-only tools auto-approve; mutating self-scoped tools also auto-approve. */
  readOnly: boolean;
  /** True when the tool needs explicit approval before executing. */
  requiresApproval: boolean;
}

export const USER_TOOLS: ToolMeta[] = [
  {
    name: "getCurrentUserProfile",
    description:
      "Get the signed-in user's profile and preferences (name, role, voice, theme).",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "getRecentConversationContext",
    description:
      "Recall a short summary of the user's most recent conversations to ground the reply.",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "getCurrentUsageSummary",
    description:
      "Get the signed-in user's current-day limits and lifetime usage summary.",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "listUserMemories",
    description: "List durable facts and preferences saved for the signed-in user.",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "getConversationTranscript",
    description:
      "Read recent turns from the current or specified conversation the user can access.",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "updateUserPreferences",
    description:
      "Update explicit profile preferences such as theme, voice, concise voice, or reduced motion.",
    scope: "user",
    readOnly: false,
    requiresApproval: false,
  },
  {
    name: "saveUserPreference",
    description:
      "Save a durable user preference or fact to memory, keyed by a short stable key.",
    scope: "user",
    readOnly: false,
    requiresApproval: false,
  },
  {
    name: "createConversationSummary",
    description:
      "Summarize the current conversation and store the summary for later retrieval.",
    scope: "user",
    readOnly: false,
    requiresApproval: false,
  },
  {
    name: "searchUserConversations",
    description: "Search the user's own conversation history by keyword.",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "getWeather",
    description:
      "Get the current weather for a city or place name (temperature, conditions, wind, humidity).",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "searchWeb",
    description:
      "Search the web for current information — news, facts, or research not in your training data.",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "createTask",
    description:
      "Create a durable task/to-do item for the signed-in user, optionally with a due date and priority.",
    scope: "user",
    readOnly: false,
    requiresApproval: false,
  },
  {
    name: "listTasks",
    description:
      "List the signed-in user's tasks. Defaults to pending (not yet completed) tasks.",
    scope: "user",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "completeTask",
    description: "Mark one of the signed-in user's tasks as completed.",
    scope: "user",
    readOnly: false,
    requiresApproval: false,
  },
  {
    name: "deleteTask",
    description: "Remove one of the signed-in user's tasks.",
    scope: "user",
    readOnly: false,
    requiresApproval: false,
  },
];

export const ADMIN_TOOLS: ToolMeta[] = [
  {
    name: "getSystemUsageSummary",
    description: "Global usage, spend, and model rollup (admin only).",
    scope: "admin",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "getUserUsageSummary",
    description: "Usage summary for a specific user (admin only).",
    scope: "admin",
    readOnly: true,
    requiresApproval: false,
  },
  {
    name: "getVoiceSessionDiagnostics",
    description: "Voice session, usage, and event diagnostics (admin only).",
    scope: "admin",
    readOnly: true,
    requiresApproval: false,
  },
];

export const ALL_TOOLS = [...USER_TOOLS, ...ADMIN_TOOLS];

/** Client-safe projection sent to the browser realtime session (no execute fns). */
export function clientSafeTools(scope: ToolScope = "user"): ClientSafeToolDefinition[] {
  const source = scope === "admin" ? ALL_TOOLS : USER_TOOLS;
  return source.map((t) => ({
    name: t.name,
    description: t.description,
    requiresApproval: t.requiresApproval,
  }));
}

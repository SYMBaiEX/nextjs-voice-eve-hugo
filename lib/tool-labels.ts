/**
 * Friendly noun labels for tool-call pills (transcript UI). Framework- and
 * runtime-agnostic — the same camelCase `toolName` lands in the Convex
 * `toolCalls` ledger whether the call came from voice, BYOK text, or the Eve
 * runtime, so one map covers every surface. Every name in
 * `hugo-agent/tool-logic.ts`'s `USER_TOOL_NAMES` + `ADMIN_TOOL_NAMES` is
 * listed here; anything new falls back to a humanized split of the name so
 * pills never look broken, just less polished until added.
 */

const TOOL_LABELS: Record<string, string> = {
  // User tools
  getCurrentUserProfile: "Profile",
  getCurrentUsageSummary: "Usage",
  listUserMemories: "Memory",
  getConversationTranscript: "Transcript",
  updateUserPreferences: "Update preferences",
  getRecentConversationContext: "Recent conversations",
  saveUserPreference: "Save preference",
  createConversationSummary: "Summarize",
  searchUserConversations: "Search conversations",
  getWeather: "Weather",
  searchWeb: "Web search",
  createTask: "Create task",
  listTasks: "Tasks",
  completeTask: "Complete task",
  deleteTask: "Delete task",
  draftEmail: "Draft email",

  // Admin-only tools
  getSystemUsageSummary: "System usage",
  getUserUsageSummary: "User usage",
  getVoiceSessionDiagnostics: "Voice diagnostics",
};

/** Humanize an unrecognized camelCase tool name, e.g. "doSomethingNew" ->
 *  "Do something new" — keeps future tools covered without a code change. */
function humanize(toolName: string): string {
  const words = toolName.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Short friendly noun label for a tool pill, e.g. "getWeather" -> "Weather". */
export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? humanize(toolName);
}

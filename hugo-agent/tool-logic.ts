import { z } from "zod";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Role, UserPreferences } from "@/lib/types";

/**
 * Hugo's tool business logic (PRD 5.10) — framework-agnostic, shared by both
 * runtimes that invoke Hugo. No `import "server-only"` here (deliberately —
 * Eve's own bundler compiles this file too, and that marker's package throws
 * outside Next's special resolution); the actual server-only boundary is each
 * consumer: every Next.js route handler that reaches this, and
 * `hugo-agent/tools/index.ts` below, both already server-only by construction.
 *
 * - the in-process AI SDK stack (`hugo-agent/tools/index.ts`, a thin `tool()`
 *   wrapper over this module), used by voice and by BYOK text chat;
 * - the Eve durable runtime (`agent/tools/*.ts`, a thin `defineTool()` wrapper
 *   over this module), used by keyless/admin text chat.
 *
 * Each entry in `TOOL_DEFS` is `{ description, inputSchema (zod, valid for
 * both AI SDK and Eve's Standard Schema), logic }`. `logic` takes an explicit
 * `HugoToolContext` + validated args and returns the tool's output — no
 * framework types leak in here. Every invocation is logged to the `toolCalls`
 * ledger (start + result/error) via `logged()`, wrapping `logic` the same way
 * regardless of caller.
 */

export interface HugoToolContext {
  token: string;
  conversationId?: Id<"conversations">;
  role?: Role;
}

/** Wrap a tool's logic fn with start/complete logging to Convex. */
export function logged<TArgs, TOutput>(
  ctx: HugoToolContext,
  toolName: string,
  fn: (args: TArgs) => Promise<TOutput>,
) {
  return async (args: TArgs) => {
    let toolCallId: Id<"toolCalls"> | undefined;
    try {
      toolCallId = await fetchMutation(
        api.toolCalls.log,
        { toolName, conversationId: ctx.conversationId, input: redact(args) },
        { token: ctx.token },
      );
    } catch {
      // Logging is best-effort; never block the tool on it.
    }
    try {
      const output = await fn(args);
      if (toolCallId) {
        await fetchMutation(
          api.toolCalls.complete,
          { toolCallId, output: redact(output) },
          { token: ctx.token },
        ).catch(() => {});
      }
      return output;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (toolCallId) {
        await fetchMutation(
          api.toolCalls.complete,
          { toolCallId, error: message },
          { token: ctx.token },
        ).catch(() => {});
      }
      return { error: message } as TOutput;
    }
  };
}

/** Shallow redaction of obviously-sensitive keys before persisting tool I/O. */
export function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const SENSITIVE = /token|secret|password|key|authorization/i;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v);
  }
  return out;
}

/** One tool's shared shape: description + input schema + framework-agnostic
 *  logic. Generic over the SCHEMA itself (not just its inferred output) so the
 *  concrete Zod class survives end to end — Eve's `defineTool` picks its
 *  overload by structurally matching the actual schema type, and widening to
 *  the abstract `z.ZodType<TArgs>` base would make every tool resolve to the
 *  wrong (untyped) overload. */
interface ToolDef<TSchema extends z.ZodTypeAny, TOutput> {
  description: string;
  inputSchema: TSchema;
  logic: (ctx: HugoToolContext, args: z.infer<TSchema>) => Promise<TOutput>;
}

/** Type-erased view used only when iterating heterogeneously (see
 *  `getToolDef`) — each tool's own file/call site still gets the fully typed
 *  `TOOL_DEFS.<name>` entry; runtime validation (`inputSchema.parse`, done by
 *  the calling framework before `logic` ever runs) is the actual safety net
 *  for the generic loop case. */
type AnyToolDef = ToolDef<z.ZodTypeAny, unknown>;

function toolDef<TSchema extends z.ZodTypeAny, TOutput>(
  def: ToolDef<TSchema, TOutput>,
): ToolDef<TSchema, TOutput> {
  return def;
}

export const TOOL_DEFS = {
  getCurrentUserProfile: toolDef({
    description:
      "Get the signed-in user's profile and preferences (name, role, voice, theme).",
    inputSchema: z.object({}),
    logic: async (ctx) => {
      return await fetchQuery(api.users.currentUser, {}, { token: ctx.token });
    },
  }),

  getCurrentUsageSummary: toolDef({
    description:
      "Get the signed-in user's current-day limits and lifetime usage summary.",
    inputSchema: z.object({}),
    logic: async (ctx) => {
      const [today, lifetime] = await Promise.all([
        fetchQuery(api.usageEvents.todayForUser, {}, { token: ctx.token }),
        fetchQuery(api.usageEvents.summaryForUser, {}, { token: ctx.token }),
      ]);
      return { today, lifetime };
    },
  }),

  listUserMemories: toolDef({
    description:
      "List durable facts and preferences saved for the signed-in user.",
    inputSchema: z.object({
      type: z
        .enum(["preference", "profile", "project", "instruction"])
        .optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    logic: async (ctx, { type, limit }) => {
      const memories = await fetchQuery(
        api.memories.listOwn,
        { type, limit },
        { token: ctx.token },
      );
      return memories.map((m) => ({
        id: m._id,
        type: m.type,
        key: m.key,
        value: m.value,
        updatedAt: m.updatedAt,
      }));
    },
  }),

  getConversationTranscript: toolDef({
    description:
      "Read recent turns from the current or specified conversation the user can access.",
    inputSchema: z.object({
      conversationId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    logic: async (ctx, { conversationId, limit }) => {
      const target =
        (conversationId as Id<"conversations"> | undefined) ??
        ctx.conversationId;
      if (!target) return { error: "No conversation was provided." };
      const messages = await fetchQuery(
        api.messages.list,
        { conversationId: target, limit },
        { token: ctx.token },
      );
      return messages.map((m) => ({
        id: m._id,
        role: m.role,
        modality: m.modality,
        content: m.content,
        createdAt: m.createdAt,
      }));
    },
  }),

  updateUserPreferences: toolDef({
    description:
      "Update explicit profile preferences such as theme, voice, concise voice, or reduced motion.",
    inputSchema: z.object({
      theme: z.enum(["dark", "light", "system"]).optional(),
      voice: z.string().min(1).max(80).optional(),
      conciseVoice: z.boolean().optional(),
      reducedMotion: z.boolean().optional(),
    }),
    logic: async (ctx, preferences) => {
      const patch = preferences as Partial<UserPreferences>;
      await fetchMutation(
        api.users.updatePreferences,
        { preferences: patch },
        { token: ctx.token },
      );
      return { saved: true, preferences: patch };
    },
  }),

  getRecentConversationContext: toolDef({
    description:
      "Recall short summaries of the user's most recent conversations to ground the reply.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(10).default(5),
    }),
    logic: async (ctx, { limit }) => {
      const convos = await fetchQuery(
        api.conversations.list,
        { status: "active", limit },
        { token: ctx.token },
      );
      return convos.map((c) => ({
        id: c._id,
        title: c.title,
        mode: c.mode,
        summary: c.summary ?? null,
        lastMessageAt: c.lastMessageAt,
      }));
    },
  }),

  saveUserPreference: toolDef({
    description:
      "Save a durable user preference or fact to memory, keyed by a short stable key.",
    inputSchema: z.object({
      type: z
        .enum(["preference", "profile", "project", "instruction"])
        .default("preference"),
      key: z.string().min(1).max(80).describe("Short stable key, e.g. 'voice_pace'"),
      value: z.string().min(1).max(500),
    }),
    logic: async (ctx, { type, key, value }) => {
      await fetchMutation(
        api.memories.upsert,
        { type, key, value, sourceConversationId: ctx.conversationId },
        { token: ctx.token },
      );
      return { saved: true, key };
    },
  }),

  createConversationSummary: toolDef({
    description:
      "Store a concise summary of the current conversation for later retrieval.",
    inputSchema: z.object({
      summary: z.string().min(1).max(1200),
    }),
    logic: async (ctx, { summary }) => {
      if (!ctx.conversationId) {
        return { error: "No active conversation to summarize." };
      }
      await fetchMutation(
        api.conversations.setSummary,
        { conversationId: ctx.conversationId, summary },
        { token: ctx.token },
      );
      return { saved: true };
    },
  }),

  searchUserConversations: toolDef({
    description: "Search the user's own conversation history by keyword.",
    inputSchema: z.object({
      query: z.string().min(1).max(100),
      limit: z.number().int().min(1).max(20).default(10),
    }),
    logic: async (ctx, { query, limit }) => {
      const results = await fetchQuery(
        api.conversations.search,
        { queryText: query, limit },
        { token: ctx.token },
      );
      return results.map((c) => ({
        id: c._id,
        title: c.title,
        summary: c.summary ?? null,
        lastMessageAt: c.lastMessageAt,
      }));
    },
  }),

  // ---- Admin-only ----------------------------------------------------------

  getSystemUsageSummary: toolDef({
    description:
      "Admin-only: inspect global usage, cost, latency, model, and system health rollups.",
    inputSchema: z.object({
      days: z.number().int().min(1).max(90).default(14),
    }),
    logic: async (ctx, { days }) => {
      const [overview, usage] = await Promise.all([
        fetchQuery(api.admin.overview, {}, { token: ctx.token }),
        fetchQuery(api.usageEvents.globalSummary, { days }, { token: ctx.token }),
      ]);
      return { overview, usage };
    },
  }),

  getUserUsageSummary: toolDef({
    description:
      "Admin-only: inspect a specific user's conversation, voice, and cost totals.",
    inputSchema: z.object({
      userId: z.string().min(1),
    }),
    logic: async (ctx, { userId }) => {
      return await fetchQuery(
        api.admin.userUsageSummary,
        { userId: userId as Id<"users"> },
        { token: ctx.token },
      );
    },
  }),

  getVoiceSessionDiagnostics: toolDef({
    description:
      "Admin-only: inspect a voice session, related usage rows, and recent agent events.",
    inputSchema: z.object({
      voiceSessionId: z.string().min(1),
    }),
    logic: async (ctx, { voiceSessionId }) => {
      return await fetchQuery(
        api.voiceSessions.getDiagnostics,
        { voiceSessionId: voiceSessionId as Id<"voiceSessions"> },
        { token: ctx.token },
      );
    },
  }),
} as const;

export const USER_TOOL_NAMES = [
  "getCurrentUserProfile",
  "getCurrentUsageSummary",
  "listUserMemories",
  "getConversationTranscript",
  "updateUserPreferences",
  "getRecentConversationContext",
  "saveUserPreference",
  "createConversationSummary",
  "searchUserConversations",
] as const;

export const ADMIN_TOOL_NAMES = [
  "getSystemUsageSummary",
  "getUserUsageSummary",
  "getVoiceSessionDiagnostics",
] as const;

export type ToolName = keyof typeof TOOL_DEFS;

/** `TOOL_DEFS` widened for generic iteration (see `AnyToolDef`). Both AI-SDK
 *  and Eve wrappers loop over a list of names and fetch each def by this. */
export function getToolDef(name: ToolName): AnyToolDef {
  return TOOL_DEFS[name];
}

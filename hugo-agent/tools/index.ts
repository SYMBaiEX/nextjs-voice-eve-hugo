import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Role, UserPreferences } from "@/lib/types";

/**
 * Hugo's user-safe tools (PRD 5.10), authored in AI-SDK `tool()` form so they
 * can be consumed both by the in-process runtime (chat + voice routes) and, when
 * graduated, by Eve's hosted runtime. Every tool runs against Convex with the
 * authenticated user's token, so authorization is enforced server-side and a
 * tool can never reach another user's data.
 *
 * Each invocation is logged to the `toolCalls` ledger (start + result/error)
 * for the admin observability console.
 */

export interface HugoToolContext {
  token: string;
  conversationId?: Id<"conversations">;
  role?: Role;
}

/** Wrap a tool execute fn with start/complete logging to Convex. */
function logged<TArgs>(
  ctx: HugoToolContext,
  toolName: string,
  fn: (args: TArgs) => Promise<unknown>,
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
      return { error: message };
    }
  };
}

/** Shallow redaction of obviously-sensitive keys before persisting tool I/O. */
function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const SENSITIVE = /token|secret|password|key|authorization/i;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v);
  }
  return out;
}

export function buildHugoTools(ctx: HugoToolContext): ToolSet {
  const tools: ToolSet = {
    getCurrentUserProfile: tool({
      description:
        "Get the signed-in user's profile and preferences (name, role, voice, theme).",
      inputSchema: z.object({}),
      execute: logged(ctx, "getCurrentUserProfile", async () => {
        return await fetchQuery(api.users.currentUser, {}, { token: ctx.token });
      }),
    }),

    getCurrentUsageSummary: tool({
      description:
        "Get the signed-in user's current-day limits and lifetime usage summary.",
      inputSchema: z.object({}),
      execute: logged(ctx, "getCurrentUsageSummary", async () => {
        const [today, lifetime] = await Promise.all([
          fetchQuery(api.usageEvents.todayForUser, {}, { token: ctx.token }),
          fetchQuery(api.usageEvents.summaryForUser, {}, { token: ctx.token }),
        ]);
        return { today, lifetime };
      }),
    }),

    listUserMemories: tool({
      description:
        "List durable facts and preferences saved for the signed-in user.",
      inputSchema: z.object({
        type: z
          .enum(["preference", "profile", "project", "instruction"])
          .optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: logged(ctx, "listUserMemories", async ({ type, limit }) => {
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
      }),
    }),

    getConversationTranscript: tool({
      description:
        "Read recent turns from the current or specified conversation the user can access.",
      inputSchema: z.object({
        conversationId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      execute: logged(
        ctx,
        "getConversationTranscript",
        async ({ conversationId, limit }) => {
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
      ),
    }),

    updateUserPreferences: tool({
      description:
        "Update explicit profile preferences such as theme, voice, concise voice, or reduced motion.",
      inputSchema: z.object({
        theme: z.enum(["dark", "light", "system"]).optional(),
        voice: z.string().min(1).max(80).optional(),
        conciseVoice: z.boolean().optional(),
        reducedMotion: z.boolean().optional(),
      }),
      execute: logged(ctx, "updateUserPreferences", async (preferences) => {
        const patch = preferences as Partial<UserPreferences>;
        await fetchMutation(
          api.users.updatePreferences,
          { preferences: patch },
          { token: ctx.token },
        );
        return { saved: true, preferences: patch };
      }),
    }),

    getRecentConversationContext: tool({
      description:
        "Recall short summaries of the user's most recent conversations to ground the reply.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(10).default(5),
      }),
      execute: logged(ctx, "getRecentConversationContext", async ({ limit }) => {
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
      }),
    }),

    saveUserPreference: tool({
      description:
        "Save a durable user preference or fact to memory, keyed by a short stable key.",
      inputSchema: z.object({
        type: z
          .enum(["preference", "profile", "project", "instruction"])
          .default("preference"),
        key: z.string().min(1).max(80).describe("Short stable key, e.g. 'voice_pace'"),
        value: z.string().min(1).max(500),
      }),
      execute: logged(ctx, "saveUserPreference", async ({ type, key, value }) => {
        await fetchMutation(
          api.memories.upsert,
          {
            type,
            key,
            value,
            sourceConversationId: ctx.conversationId,
          },
          { token: ctx.token },
        );
        return { saved: true, key };
      }),
    }),

    createConversationSummary: tool({
      description:
        "Store a concise summary of the current conversation for later retrieval.",
      inputSchema: z.object({
        summary: z.string().min(1).max(1200),
      }),
      execute: logged(ctx, "createConversationSummary", async ({ summary }) => {
        if (!ctx.conversationId) {
          return { error: "No active conversation to summarize." };
        }
        await fetchMutation(
          api.conversations.setSummary,
          { conversationId: ctx.conversationId, summary },
          { token: ctx.token },
        );
        return { saved: true };
      }),
    }),

    searchUserConversations: tool({
      description: "Search the user's own conversation history by keyword.",
      inputSchema: z.object({
        query: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: logged(ctx, "searchUserConversations", async ({ query, limit }) => {
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
      }),
    }),
  };

  if (ctx.role === "admin") {
    tools.getSystemUsageSummary = tool({
      description:
        "Admin-only: inspect global usage, cost, latency, model, and system health rollups.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).default(14),
      }),
      execute: logged(ctx, "getSystemUsageSummary", async ({ days }) => {
        const [overview, usage] = await Promise.all([
          fetchQuery(api.admin.overview, {}, { token: ctx.token }),
          fetchQuery(api.usageEvents.globalSummary, { days }, { token: ctx.token }),
        ]);
        return { overview, usage };
      }),
    });

    tools.getUserUsageSummary = tool({
      description:
        "Admin-only: inspect a specific user's conversation, voice, and cost totals.",
      inputSchema: z.object({
        userId: z.string().min(1),
      }),
      execute: logged(ctx, "getUserUsageSummary", async ({ userId }) => {
        return await fetchQuery(
          api.admin.userUsageSummary,
          { userId: userId as Id<"users"> },
          { token: ctx.token },
        );
      }),
    });

    tools.getVoiceSessionDiagnostics = tool({
      description:
        "Admin-only: inspect a voice session, related usage rows, and recent agent events.",
      inputSchema: z.object({
        voiceSessionId: z.string().min(1),
      }),
      execute: logged(ctx, "getVoiceSessionDiagnostics", async ({ voiceSessionId }) => {
        return await fetchQuery(
          api.voiceSessions.getDiagnostics,
          { voiceSessionId: voiceSessionId as Id<"voiceSessions"> },
          { token: ctx.token },
        );
      }),
    });
  }

  return tools;
}

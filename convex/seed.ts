import { mutation } from "./_generated/server";
import { requireAdmin } from "./model/authz";
import { estimateCost } from "./model/usage";

/**
 * Demo data seed (clearly isolated; NOT used by core flows). Admin-only. Creates
 * a handful of conversations, messages, voice sessions, usage/agent events, tool
 * calls, and an audit log so the admin dashboard renders with realistic data
 * during development. Everything is tagged `demo` and owned by the calling admin.
 *
 * Run from the Convex dashboard or: `npx convex run seed:seedDemoData`
 * (while signed in as an admin via the app — or call from an authed admin route).
 */
export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const models = ["openai/gpt-5.5", "openai/gpt-realtime-2", "anthropic/claude-sonnet-4.6"];
    let created = 0;

    for (let i = 0; i < 6; i++) {
      const mode = i % 3 === 0 ? "voice" : i % 3 === 1 ? "text" : "mixed";
      const createdAt = now - i * day - Math.floor(Math.random() * day);
      const conversationId = await ctx.db.insert("conversations", {
        userId: admin._id,
        title: `Demo ${mode} session ${i + 1}`,
        mode: mode as "voice" | "text" | "mixed",
        status: "active",
        createdAt,
        updatedAt: createdAt,
        lastMessageAt: createdAt + 60_000,
        summary: "Demo conversation seeded for the admin dashboard.",
        tags: ["demo"],
      });
      created++;

      await ctx.db.insert("messages", {
        conversationId,
        userId: admin._id,
        role: "user",
        modality: mode === "voice" ? "audio" : "text",
        content: "What can you do?",
        createdAt: createdAt + 1000,
      });
      await ctx.db.insert("messages", {
        conversationId,
        userId: admin._id,
        role: "assistant",
        modality: mode === "voice" ? "audio" : "text",
        content: "I'm Hugo — I can talk, remember your preferences, and help fast.",
        createdAt: createdAt + 2000,
      });

      const model = models[i % models.length];
      if (mode !== "text") {
        const startedAt = createdAt + 3000;
        const durationMs = 60_000 + Math.floor(Math.random() * 240_000);
        const status = i === 4 ? "failed" : "ended";
        const voiceSessionId = await ctx.db.insert("voiceSessions", {
          userId: admin._id,
          conversationId,
          provider: "ai-gateway",
          model: "openai/gpt-realtime-2",
          voice: "alloy",
          status: status as "ended" | "failed",
          startedAt,
          endedAt: startedAt + durationMs,
          durationMs,
          interruptionCount: Math.floor(Math.random() * 3),
          turnCount: 2 + Math.floor(Math.random() * 8),
          ...(status === "failed"
            ? { errorCode: "connection_lost", errorMessage: "Demo failure" }
            : {}),
        });
        const audioInputSeconds = Math.floor(durationMs / 1000 / 2);
        const audioOutputSeconds = Math.floor(durationMs / 1000 / 2);
        await ctx.db.insert("usageEvents", {
          userId: admin._id,
          conversationId,
          voiceSessionId,
          type: "voice_session",
          provider: "ai-gateway",
          model: "openai/gpt-realtime-2",
          audioInputSeconds,
          audioOutputSeconds,
          estimatedCost: estimateCost({ audioInputSeconds, audioOutputSeconds }),
          latencyMs: 300 + Math.floor(Math.random() * 500),
          createdAt: startedAt,
        });
        await ctx.db.insert("agentEvents", {
          userId: admin._id,
          conversationId,
          voiceSessionId,
          eventType: status === "failed" ? "voice_session_failed" : "voice_session_ended",
          status: status === "failed" ? "error" : "ok",
          createdAt: startedAt + durationMs,
        });
      }

      const inputTokens = 200 + Math.floor(Math.random() * 800);
      const outputTokens = 100 + Math.floor(Math.random() * 600);
      await ctx.db.insert("usageEvents", {
        userId: admin._id,
        conversationId,
        type: "text_message",
        provider: "ai-gateway",
        model,
        inputTokens,
        outputTokens,
        estimatedCost: estimateCost({ inputTokens, outputTokens }),
        latencyMs: 400 + Math.floor(Math.random() * 900),
        createdAt: createdAt + 2500,
      });

      await ctx.db.insert("toolCalls", {
        userId: admin._id,
        conversationId,
        toolName: i % 2 === 0 ? "getCurrentUserProfile" : "saveUserPreference",
        approvalStatus: i === 3 ? "pending" : "not_required",
        input: { demo: true },
        output: i === 3 ? undefined : { ok: true },
        startedAt: createdAt + 2600,
        completedAt: i === 3 ? undefined : createdAt + 2700,
      });
    }

    await ctx.db.insert("memories", {
      userId: admin._id,
      type: "preference",
      key: "voice_pace",
      value: "User prefers slightly slower voice responses.",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("adminAuditLogs", {
      adminUserId: admin._id,
      action: "demo.seed",
      targetType: "system",
      metadata: { created },
      createdAt: now,
    });

    return { ok: true, conversations: created };
  },
});

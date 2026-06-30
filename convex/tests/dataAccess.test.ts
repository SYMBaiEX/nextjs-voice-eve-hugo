/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

async function insertUser(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    email: string;
    role: "user" | "admin";
    status: "active" | "disabled";
    createdAt: number;
    updatedAt: number;
    lastSeenAt: number;
  }> = {},
): Promise<Id<"users">> {
  const now = overrides.createdAt ?? Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: overrides.email,
      role: overrides.role ?? "user",
      status: overrides.status ?? "active",
      createdAt: now,
      updatedAt: overrides.updatedAt ?? now,
      lastSeenAt: overrides.lastSeenAt ?? now,
    }),
  );
}

describe("convex data-access behavior", () => {
  test("conversations.listForAdmin applies filters before limiting recent rows", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, {
      email: "admin@example.com",
      role: "admin",
      createdAt: 1,
    });
    const ownerId = await insertUser(t, {
      email: "owner@example.com",
      createdAt: 2,
    });

    const targetId = await t.run(async (ctx) => {
      for (let i = 0; i < 120; i += 1) {
        await ctx.db.insert("conversations", {
          userId: ownerId,
          title: `recent-${i}`,
          mode: "voice",
          status: "active",
          createdAt: 1_000 + i,
          updatedAt: 1_000 + i,
          lastMessageAt: 1_000 + i,
        });
      }
      return await ctx.db.insert("conversations", {
        userId: ownerId,
        title: "older deleted text conversation",
        mode: "text",
        status: "deleted",
        createdAt: 10,
        updatedAt: 10,
        lastMessageAt: 10,
      });
    });

    const admin = t.withIdentity({ subject: adminId });
    const rows = await admin.query(api.conversations.listForAdmin, {
      mode: "text",
      status: "deleted",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?._id).toBe(targetId);
    expect(rows[0]?.ownerEmail).toBe("owner@example.com");
  });

  test("voiceSessions.listForAdmin applies status filtering before limiting recent rows", async () => {
    const t = convexTest(schema, modules);
    const adminId = await insertUser(t, {
      email: "admin@example.com",
      role: "admin",
      createdAt: 1,
    });
    const ownerId = await insertUser(t, {
      email: "owner@example.com",
      createdAt: 2,
    });

    const failedSessionId = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        userId: ownerId,
        title: "session source",
        mode: "voice",
        status: "active",
        createdAt: 10,
        updatedAt: 10,
        lastMessageAt: 10,
      });

      for (let i = 0; i < 120; i += 1) {
        await ctx.db.insert("voiceSessions", {
          userId: ownerId,
          conversationId,
          provider: "ai-gateway",
          model: "openai/gpt-realtime-2",
          voice: "alloy",
          status: "ended",
          startedAt: 2_000 + i,
          endedAt: 2_100 + i,
          durationMs: 1000,
          interruptionCount: 0,
          turnCount: 1,
        });
      }

      return await ctx.db.insert("voiceSessions", {
        userId: ownerId,
        conversationId,
        provider: "ai-gateway",
        model: "openai/gpt-realtime-2",
        voice: "alloy",
        status: "failed",
        startedAt: 10,
        endedAt: 20,
        durationMs: 10,
        interruptionCount: 0,
        turnCount: 0,
        errorCode: "socket_closed",
      });
    });

    const admin = t.withIdentity({ subject: adminId });
    const rows = await admin.query(api.voiceSessions.listForAdmin, {
      status: "failed",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?._id).toBe(failedSessionId);
    expect(rows[0]?.ownerEmail).toBe("owner@example.com");
  });

  test("voiceSessions.end does not create duplicate usage events on retry", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, {
      email: "owner@example.com",
      createdAt: 1,
    });

    const { voiceSessionId } = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        userId,
        title: "retry test",
        mode: "voice",
        status: "active",
        createdAt: 100,
        updatedAt: 100,
        lastMessageAt: 100,
      });
      const voiceSessionId = await ctx.db.insert("voiceSessions", {
        userId,
        conversationId,
        provider: "ai-gateway",
        model: "openai/gpt-realtime-2",
        voice: "alloy",
        status: "active",
        startedAt: Date.now() - 5_000,
        interruptionCount: 0,
        turnCount: 0,
      });
      return { voiceSessionId };
    });

    const authed = t.withIdentity({ subject: userId });
    await authed.mutation(api.voiceSessions.end, {
      voiceSessionId,
      status: "ended",
      turnCount: 3,
    });
    await authed.mutation(api.voiceSessions.end, {
      voiceSessionId,
      status: "ended",
      turnCount: 3,
    });

    const usageRows = await t.run(async (ctx) =>
      ctx.db
        .query("usageEvents")
        .withIndex("by_voiceSession", (q) => q.eq("voiceSessionId", voiceSessionId))
        .collect(),
    );

    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]?.type).toBe("voice_session");
  });

  test("voiceSessions.end rejects a different authenticated user", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, {
      email: "owner@example.com",
      createdAt: 1,
    });
    const attackerId = await insertUser(t, {
      email: "attacker@example.com",
      createdAt: 2,
    });

    const voiceSessionId = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        userId: ownerId,
        title: "protected session",
        mode: "voice",
        status: "active",
        createdAt: 100,
        updatedAt: 100,
        lastMessageAt: 100,
      });
      return await ctx.db.insert("voiceSessions", {
        userId: ownerId,
        conversationId,
        provider: "ai-gateway",
        model: "openai/gpt-realtime-2",
        voice: "alloy",
        status: "active",
        startedAt: 200,
        interruptionCount: 0,
        turnCount: 0,
      });
    });

    const attacker = t.withIdentity({ subject: attackerId });
    await expect(
      attacker.mutation(api.voiceSessions.end, {
        voiceSessionId,
        status: "failed",
      }),
    ).rejects.toThrow(/Forbidden/i);
  });

  test("messages.appendVoiceTurn is idempotent per realtime source id", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, {
      email: "voice@example.com",
      createdAt: 1,
    });

    const { conversationId, voiceSessionId } = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        userId,
        title: "Voice session",
        mode: "voice",
        status: "active",
        createdAt: 100,
        updatedAt: 100,
        lastMessageAt: 100,
      });
      const voiceSessionId = await ctx.db.insert("voiceSessions", {
        userId,
        conversationId,
        provider: "ai-gateway",
        model: "openai/gpt-realtime-2",
        voice: "alloy",
        status: "active",
        startedAt: 200,
        interruptionCount: 0,
        turnCount: 0,
      });
      return { conversationId, voiceSessionId };
    });

    const authed = t.withIdentity({ subject: userId });
    const firstId = await authed.mutation(api.messages.appendVoiceTurn, {
      voiceSessionId,
      sourceId: "user-input-item-1",
      role: "user",
      content: "Please remember this voice turn.",
    });
    const secondId = await authed.mutation(api.messages.appendVoiceTurn, {
      voiceSessionId,
      sourceId: "user-input-item-1",
      role: "user",
      content: "Please remember this voice turn.",
    });

    expect(secondId).toBe(firstId);

    const messages = await authed.query(api.messages.list, {
      conversationId,
      limit: 10,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.modality).toBe("audio");
    expect(messages[0]?.sourceId).toBe("user-input-item-1");
    expect(messages[0]?.transcript).toBe("Please remember this voice turn.");

    const session = await t.run(async (ctx) => ctx.db.get(voiceSessionId));
    expect(session?.status).toBe("active");
    expect(session?.turnCount).toBe(1);
  });

  test("messages.appendVoiceTurn rejects a different authenticated user", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, {
      email: "owner@example.com",
      createdAt: 1,
    });
    const attackerId = await insertUser(t, {
      email: "attacker@example.com",
      createdAt: 2,
    });

    const voiceSessionId = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        userId: ownerId,
        title: "protected voice",
        mode: "voice",
        status: "active",
        createdAt: 100,
        updatedAt: 100,
        lastMessageAt: 100,
      });
      return await ctx.db.insert("voiceSessions", {
        userId: ownerId,
        conversationId,
        provider: "ai-gateway",
        model: "openai/gpt-realtime-2",
        voice: "alloy",
        status: "active",
        startedAt: 200,
        interruptionCount: 0,
        turnCount: 0,
      });
    });

    const attacker = t.withIdentity({ subject: attackerId });
    await expect(
      attacker.mutation(api.messages.appendVoiceTurn, {
        voiceSessionId,
        sourceId: "stolen-source",
        role: "user",
        content: "not mine",
      }),
    ).rejects.toThrow(/Forbidden/i);
  });
});

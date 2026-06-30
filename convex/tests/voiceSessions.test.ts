/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

describe("voiceSessions.endStale (cron sweep)", () => {
  test("ends orphaned sessions past the threshold, leaves live + ended ones", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const { staleActiveId, staleConnectingId, freshId, alreadyEndedId } =
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {
          email: "owner@example.com",
          role: "user",
          status: "active",
          createdAt: now,
          updatedAt: now,
          lastSeenAt: now,
        });
        const conversationId = await ctx.db.insert("conversations", {
          userId,
          title: "Voice session",
          mode: "voice",
          status: "active",
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
        });
        const base = {
          userId,
          conversationId,
          provider: "ai-gateway",
          model: "openai/gpt-realtime-2",
          voice: "alloy",
          interruptionCount: 0,
          turnCount: 0,
        };
        return {
          // Orphaned 2h ago — should be swept.
          staleActiveId: await ctx.db.insert("voiceSessions", {
            ...base,
            status: "active",
            startedAt: now - 2 * 60 * 60 * 1000,
          }),
          // Orphaned mid-connect 2h ago — should be swept.
          staleConnectingId: await ctx.db.insert("voiceSessions", {
            ...base,
            status: "connecting",
            startedAt: now - 2 * 60 * 60 * 1000,
          }),
          // Live right now — must be left alone.
          freshId: await ctx.db.insert("voiceSessions", {
            ...base,
            status: "active",
            startedAt: now,
          }),
          // Already finalized long ago — must not be touched again.
          alreadyEndedId: await ctx.db.insert("voiceSessions", {
            ...base,
            status: "ended",
            startedAt: now - 3 * 60 * 60 * 1000,
            endedAt: now - 3 * 60 * 60 * 1000 + 1000,
            durationMs: 1000,
          }),
        };
      });

    const result = await t.mutation(internal.voiceSessions.endStale, {});
    expect(result.ended).toBe(2);

    const [staleActive, staleConnecting, fresh, alreadyEnded] = await t.run(
      async (ctx) => [
        await ctx.db.get(staleActiveId),
        await ctx.db.get(staleConnectingId),
        await ctx.db.get(freshId),
        await ctx.db.get(alreadyEndedId),
      ],
    );

    // Orphans finalized + tagged, never re-metered.
    expect(staleActive?.status).toBe("ended");
    expect(staleActive?.errorCode).toBe("swept_stale");
    expect(staleActive?.endedAt).toBeDefined();
    expect(staleConnecting?.status).toBe("ended");
    expect(staleConnecting?.errorCode).toBe("swept_stale");

    // Live session untouched.
    expect(fresh?.status).toBe("active");
    expect(fresh?.endedAt).toBeUndefined();

    // Previously-ended session untouched (keeps its original duration).
    expect(alreadyEnded?.status).toBe("ended");
    expect(alreadyEnded?.durationMs).toBe(1000);
    expect(alreadyEnded?.errorCode).toBeUndefined();
  });
});

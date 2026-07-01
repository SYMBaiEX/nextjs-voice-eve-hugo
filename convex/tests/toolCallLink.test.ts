/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

/**
 * Tool-call → assistant-message linkage (rich-chat tool pills).
 *
 * Tool calls are logged mid-turn, before the assistant message exists, so they
 * start with no `messageId`. When the assistant message is appended, the
 * conversation's still-unclaimed calls must be stamped with that message id so
 * pills attach to the exact turn. This also empirically pins the one subtle
 * dependency: that `.eq("messageId", undefined)` on the compound index
 * actually matches unlinked rows (if it didn't, claiming would silently no-op).
 */
const modules = import.meta.glob("../**/*.ts");

async function insertUser(
  t: ReturnType<typeof convexTest>,
  email: string,
): Promise<Id<"users">> {
  const now = Date.now();
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      role: "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    }),
  );
}

describe("tool-call linkage on assistant append", () => {
  test("an assistant turn claims the conversation's unlinked tool calls", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "owner@example.com");
    const asUser = t.withIdentity({ subject: userId });

    const conversationId = await asUser.mutation(api.conversations.create, {});

    // Two tool calls run during the turn — logged with no messageId yet.
    await asUser.mutation(api.toolCalls.log, {
      toolName: "searchWeb",
      conversationId,
      input: { query: "pizza" },
    });
    await asUser.mutation(api.toolCalls.log, {
      toolName: "getWeather",
      conversationId,
      input: { location: "Birmingham" },
    });

    // Before the answer lands, both are unlinked.
    const before = await asUser.query(api.toolCalls.listForConversation, {
      conversationId,
    });
    expect(before).toHaveLength(2);
    expect(before.every((c) => c.messageId == null)).toBe(true);

    // The assistant message lands → it claims both calls.
    const messageId = await asUser.mutation(api.messages.append, {
      conversationId,
      role: "assistant",
      content: "Here are a few spots.",
    });

    const after = await asUser.query(api.toolCalls.listForConversation, {
      conversationId,
    });
    expect(after).toHaveLength(2);
    expect(after.every((c) => c.messageId === messageId)).toBe(true);
  });

  test("a user turn does NOT claim tool calls (only assistant turns do)", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "owner2@example.com");
    const asUser = t.withIdentity({ subject: userId });
    const conversationId = await asUser.mutation(api.conversations.create, {});

    await asUser.mutation(api.toolCalls.log, {
      toolName: "searchWeb",
      conversationId,
      input: { query: "pizza" },
    });
    await asUser.mutation(api.messages.append, {
      conversationId,
      role: "user",
      content: "find pizza",
    });

    const calls = await asUser.query(api.toolCalls.listForConversation, {
      conversationId,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].messageId).toBeUndefined();
  });

  test("each assistant turn claims only its own turn's calls", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "owner3@example.com");
    const asUser = t.withIdentity({ subject: userId });
    const conversationId = await asUser.mutation(api.conversations.create, {});

    // Turn 1: one call, then the assistant answer.
    await asUser.mutation(api.toolCalls.log, {
      toolName: "searchWeb",
      conversationId,
      input: { query: "a" },
    });
    const msg1 = await asUser.mutation(api.messages.append, {
      conversationId,
      role: "assistant",
      content: "answer 1",
    });

    // Turn 2: a different call, then the second answer.
    await asUser.mutation(api.toolCalls.log, {
      toolName: "getWeather",
      conversationId,
      input: { location: "b" },
    });
    const msg2 = await asUser.mutation(api.messages.append, {
      conversationId,
      role: "assistant",
      content: "answer 2",
    });

    const calls = await asUser.query(api.toolCalls.listForConversation, {
      conversationId,
    });
    const byTool = Object.fromEntries(calls.map((c) => [c.toolName, c.messageId]));
    // Turn 2's append must not re-claim turn 1's already-linked call.
    expect(byTool.searchWeb).toBe(msg1);
    expect(byTool.getWeather).toBe(msg2);
  });
});

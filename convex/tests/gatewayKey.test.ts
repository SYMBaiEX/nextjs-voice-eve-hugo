/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

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

describe("BYOK gateway key storage", () => {
  test("set/clear round-trips; currentUser exposes only hasGatewayKey", async () => {
    const t = convexTest(schema, modules);
    const userId = await insertUser(t, "owner@example.com");
    const asUser = t.withIdentity({ subject: userId });

    const CIPHER = "aaaa.bbbb.cccc"; // ivHex.tagHex.ctHex shape (opaque here)
    await asUser.mutation(api.users.setGatewayKey, { encrypted: CIPHER });

    // currentUser flips hasGatewayKey true but never returns the ciphertext.
    const me = await asUser.query(api.users.currentUser, {});
    expect(me?.hasGatewayKey).toBe(true);
    expect(me).not.toHaveProperty("gatewayKeyEncrypted");

    // The owner can read their own ciphertext (for the route to decrypt).
    expect(await asUser.query(api.users.gatewayKeyForSelf, {})).toBe(CIPHER);

    // Clearing removes it.
    await asUser.mutation(api.users.clearGatewayKey, {});
    const me2 = await asUser.query(api.users.currentUser, {});
    expect(me2?.hasGatewayKey).toBe(false);
    expect(await asUser.query(api.users.gatewayKeyForSelf, {})).toBeNull();
  });

  test("a user never sees another user's key", async () => {
    const t = convexTest(schema, modules);
    const a = await insertUser(t, "a@example.com");
    const b = await insertUser(t, "b@example.com");
    await t
      .withIdentity({ subject: a })
      .mutation(api.users.setGatewayKey, { encrypted: "secret.of.a" });

    // B's self-read is null; B's currentUser shows no key.
    expect(
      await t.withIdentity({ subject: b }).query(api.users.gatewayKeyForSelf, {}),
    ).toBeNull();
    const meB = await t
      .withIdentity({ subject: b })
      .query(api.users.currentUser, {});
    expect(meB?.hasGatewayKey).toBe(false);
  });

  test("setting a key requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.setGatewayKey, { encrypted: "x.y.z" }),
    ).rejects.toThrow();
  });
});

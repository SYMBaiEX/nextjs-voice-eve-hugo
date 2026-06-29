/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

/**
 * Security-critical Convex behavior (PRD 5.1, 5.7, 5.8, 5.17).
 *
 * These tests prove — against the real Convex functions, in-memory via
 * convex-test — that:
 *   - guest reads of the current user resolve to null (no throw, no leak),
 *   - protected mutations reject unauthenticated callers,
 *   - admin-only queries reject unauthenticated callers,
 *   - the public settings projection is readable without auth and exposes the
 *     guest-preview flag.
 *
 * `import.meta.glob` is how convex-test discovers every Convex module so the
 * function references in `api` resolve to runnable implementations.
 */
const modules = import.meta.glob("../**/*.ts");

describe("convex auth boundaries", () => {
  test("currentUser returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.currentUser, {})).toBeNull();
  });

  test("protected mutation rejects unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.conversations.create, {}),
    ).rejects.toThrow(/Unauthorized|sign in/i);
  });

  test("admin query rejects unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.admin.overview, {})).rejects.toThrow();
  });

  test("settings.getPublic returns an object exposing guestPreviewEnabled (no auth)", async () => {
    const t = convexTest(schema, modules);
    const pub = await t.query(api.settings.getPublic, {});
    expect(pub).toBeTypeOf("object");
    expect(pub).not.toBeNull();
    expect(pub).toHaveProperty("guestPreviewEnabled");
  });
});

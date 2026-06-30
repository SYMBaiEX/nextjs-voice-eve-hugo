import { describe, expect, test } from "vitest";

import {
  isAdmin,
  isActive,
  canStartSession,
  canAccessAdmin,
  isProtectedPath,
  isAdminPath,
  type SessionUserLike,
} from "@/lib/permissions";
import {
  isTextLimitReached,
  isVoiceLimitReached,
  remainingText,
  remainingVoiceMinutes,
} from "@/lib/usage";
import {
  formatUsd,
  formatDuration,
  formatCompact,
  timeAgo,
  initials,
  shortId,
} from "@/lib/utils";
import {
  clientSafeTools,
  USER_TOOLS,
  ADMIN_TOOLS,
} from "@/agent/hugo/tools/registry";

const admin: SessionUserLike = { role: "admin", status: "active" };
const user: SessionUserLike = { role: "user", status: "active" };
const disabledAdmin: SessionUserLike = { role: "admin", status: "disabled" };
const disabledUser: SessionUserLike = { role: "user", status: "disabled" };

describe("lib/permissions", () => {
  test("isAdmin only true for active/disabled admin role", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(disabledAdmin)).toBe(true);
    expect(isAdmin(user)).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  test("isActive reflects status", () => {
    expect(isActive(user)).toBe(true);
    expect(isActive(disabledUser)).toBe(false);
    expect(isActive(null)).toBe(false);
  });

  test("canStartSession requires a signed-in active user", () => {
    expect(canStartSession(user)).toBe(true);
    expect(canStartSession(admin)).toBe(true);
    expect(canStartSession(disabledUser)).toBe(false);
    expect(canStartSession(null)).toBe(false);
    expect(canStartSession(undefined)).toBe(false);
  });

  test("canAccessAdmin requires an active admin", () => {
    expect(canAccessAdmin(admin)).toBe(true);
    expect(canAccessAdmin(disabledAdmin)).toBe(false);
    expect(canAccessAdmin(user)).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
  });

  test("isProtectedPath matches protected + admin prefixes, not public", () => {
    expect(isProtectedPath("/chat")).toBe(true);
    expect(isProtectedPath("/chat/123")).toBe(true);
    expect(isProtectedPath("/conversations")).toBe(true);
    expect(isProtectedPath("/settings/profile")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/admin/users")).toBe(true);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/sign-in")).toBe(false);
    expect(isProtectedPath("/chatter")).toBe(false); // not a prefix boundary
  });

  test("isAdminPath only matches the admin prefix", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/audit")).toBe(true);
    expect(isAdminPath("/chat")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/administrative")).toBe(false);
  });
});

describe("lib/usage", () => {
  const limits = { dailyVoiceMinutes: 30, dailyTextMessages: 200 };

  test("isTextLimitReached at boundary", () => {
    expect(isTextLimitReached({ textMessages: 199, voiceMinutes: 0 }, limits)).toBe(
      false,
    );
    expect(isTextLimitReached({ textMessages: 200, voiceMinutes: 0 }, limits)).toBe(
      true,
    );
    expect(isTextLimitReached({ textMessages: 201, voiceMinutes: 0 }, limits)).toBe(
      true,
    );
  });

  test("isVoiceLimitReached at boundary", () => {
    expect(isVoiceLimitReached({ textMessages: 0, voiceMinutes: 29 }, limits)).toBe(
      false,
    );
    expect(isVoiceLimitReached({ textMessages: 0, voiceMinutes: 30 }, limits)).toBe(
      true,
    );
    expect(isVoiceLimitReached({ textMessages: 0, voiceMinutes: 31 }, limits)).toBe(
      true,
    );
  });

  test("remainingText never goes negative", () => {
    expect(remainingText({ textMessages: 50, voiceMinutes: 0 }, limits)).toBe(150);
    expect(remainingText({ textMessages: 200, voiceMinutes: 0 }, limits)).toBe(0);
    expect(remainingText({ textMessages: 9999, voiceMinutes: 0 }, limits)).toBe(0);
  });

  test("remainingVoiceMinutes never goes negative", () => {
    expect(
      remainingVoiceMinutes({ textMessages: 0, voiceMinutes: 10 }, limits),
    ).toBe(20);
    expect(
      remainingVoiceMinutes({ textMessages: 0, voiceMinutes: 999 }, limits),
    ).toBe(0);
  });
});

describe("lib/utils", () => {
  test("formatUsd thresholds", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0001)).toBe("$0.0001");
    expect(formatUsd(0.42)).toBe("$0.42");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatUsd(2500)).toBe("$2.5k");
  });

  test("formatDuration buckets", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(-100)).toBe("0s");
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_660_000)).toBe("1h 1m");
  });

  test("formatCompact smoke", () => {
    expect(formatCompact(1200)).toBe("1.2K");
    expect(formatCompact(0)).toBe("0");
  });

  test("timeAgo smoke (returns a non-empty string)", () => {
    expect(timeAgo(Date.now())).toBe("just now");
    expect(typeof timeAgo(Date.now() - 5 * 60_000)).toBe("string");
    expect(timeAgo(Date.now() - 5 * 60_000)).toMatch(/ago/);
  });

  test("initials from name and email", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("madonna")).toBe("MA");
    expect(initials(null, "grace.hopper@navy.mil")).toBe("GH");
    expect(initials(null, null)).toBe("?");
    expect(initials("", "")).toBe("?");
  });

  test("shortId returns trailing 6 chars", () => {
    expect(shortId("abcdef1234567")).toBe("234567");
    expect(shortId("xyz")).toBe("xyz");
  });
});

describe("agent/hugo/tools/registry", () => {
  const ALLOWED_KEYS = ["name", "description", "requiresApproval"].sort();

  test("clientSafeTools('user') returns the registered user tools", () => {
    const tools = clientSafeTools("user");
    expect(tools).toHaveLength(USER_TOOLS.length);
    expect(tools.map((t) => t.name).sort()).toEqual(
      USER_TOOLS.map((t) => t.name).sort(),
    );
  });

  test("each user tool exposes name/description/requiresApproval and nothing else", () => {
    for (const tool of clientSafeTools("user")) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.requiresApproval).toBe("boolean");
      // No leaked keys (execute fns, scope, secrets, readOnly).
      expect(Object.keys(tool).sort()).toEqual(ALLOWED_KEYS);
      expect("execute" in tool).toBe(false);
      expect("scope" in tool).toBe(false);
    }
  });

  test("clientSafeTools('admin') includes admin tools and never leaks extra keys", () => {
    const tools = clientSafeTools("admin");
    expect(tools).toHaveLength(USER_TOOLS.length + ADMIN_TOOLS.length);
    const names = tools.map((t) => t.name);
    for (const adminTool of ADMIN_TOOLS) {
      expect(names).toContain(adminTool.name);
    }
    for (const tool of tools) {
      expect(Object.keys(tool).sort()).toEqual(ALLOWED_KEYS);
    }
  });

  test("admin registry exposes only implemented read-only diagnostics for now", () => {
    expect(ADMIN_TOOLS.every((t) => t.readOnly)).toBe(true);
    expect(clientSafeTools("admin").filter((t) => t.requiresApproval)).toEqual([]);
  });
});

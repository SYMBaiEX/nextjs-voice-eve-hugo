import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Doc } from "@/convex/_generated/dataModel";

export const REALTIME_TOOL_GRANT_COOKIE = "hugo_realtime_tool_grant";

export interface RealtimeToolGrantMetadata {
  expiresAtMs: number;
  hash: string;
  issuedAtMs: number;
}

export function createRealtimeToolGrant(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRealtimeToolGrant(grant: string): string {
  return createHash("sha256").update(grant).digest("hex");
}

export function encodeRealtimeToolGrantCookie(args: {
  grant: string;
  voiceSessionId: string;
}): string {
  return `${encodeURIComponent(args.voiceSessionId)}.${args.grant}`;
}

export function decodeRealtimeToolGrantCookie(
  value: string | undefined,
): { grant: string; voiceSessionId: string } | null {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0) return null;
  const encodedSessionId = value.slice(0, separator);
  const grant = value.slice(separator + 1);
  if (!grant) return null;
  try {
    return {
      grant,
      voiceSessionId: decodeURIComponent(encodedSessionId),
    };
  } catch {
    return null;
  }
}

export function realtimeToolGrantMetadata(
  grant: string,
  expiresAtMs: number,
): RealtimeToolGrantMetadata {
  return {
    expiresAtMs,
    hash: hashRealtimeToolGrant(grant),
    issuedAtMs: Date.now(),
  };
}

export function readRealtimeToolGrantMetadata(
  session: Doc<"voiceSessions">,
): RealtimeToolGrantMetadata | null {
  const metadata = session.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const grant = (metadata as Record<string, unknown>).realtimeToolGrant;
  if (!grant || typeof grant !== "object" || Array.isArray(grant)) return null;
  const row = grant as Record<string, unknown>;
  if (
    typeof row.hash !== "string" ||
    typeof row.expiresAtMs !== "number" ||
    typeof row.issuedAtMs !== "number"
  ) {
    return null;
  }
  return {
    expiresAtMs: row.expiresAtMs,
    hash: row.hash,
    issuedAtMs: row.issuedAtMs,
  };
}

export function isRealtimeToolGrantValid(args: {
  grant: string;
  metadata: RealtimeToolGrantMetadata | null;
  nowMs?: number;
}): boolean {
  if (!args.metadata) return false;
  if (args.metadata.expiresAtMs <= (args.nowMs ?? Date.now())) return false;

  const actual = Buffer.from(hashRealtimeToolGrant(args.grant), "hex");
  const expected = Buffer.from(args.metadata.hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

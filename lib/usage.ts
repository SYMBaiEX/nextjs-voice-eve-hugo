/**
 * Usage-limit helpers (PRD 5.11, 5.17). Pure functions, safe on client and
 * server. The authoritative enforcement happens in the route handlers using the
 * current user's `usageLimits` and today's usage from Convex.
 */

import { COST_ESTIMATES } from "@/lib/constants";

export interface TodayUsage {
  textMessages: number;
  voiceMinutes: number;
}

export interface Limits {
  dailyVoiceMinutes: number;
  dailyTextMessages: number;
}

export function isTextLimitReached(usage: TodayUsage, limits: Limits): boolean {
  return usage.textMessages >= limits.dailyTextMessages;
}

export function isVoiceLimitReached(usage: TodayUsage, limits: Limits): boolean {
  return usage.voiceMinutes >= limits.dailyVoiceMinutes;
}

export function remainingText(usage: TodayUsage, limits: Limits): number {
  return Math.max(0, limits.dailyTextMessages - usage.textMessages);
}

export function remainingVoiceMinutes(
  usage: TodayUsage,
  limits: Limits,
): number {
  return Math.max(0, limits.dailyVoiceMinutes - usage.voiceMinutes);
}

/** Estimate USD cost of a text turn (display only; gateway is authoritative). */
export function estimateTextCost(
  inputTokens: number,
  outputTokens: number,
): number {
  return Number(
    (
      (inputTokens / 1000) * COST_ESTIMATES.textInputPer1k +
      (outputTokens / 1000) * COST_ESTIMATES.textOutputPer1k
    ).toFixed(6),
  );
}

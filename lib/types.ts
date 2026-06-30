/**
 * Shared, framework-agnostic types for Hugo. Safe to import from both client
 * and server (no secrets, no Node APIs).
 */

import type { Role } from "@/lib/constants";
import type { Experimental_RealtimeToolDefinition } from "ai";

export type { Role };

/** Orb visual/interaction states (PRD 5.3). */
export type HugoOrbState =
  | "idle"
  | "auth_required"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "tool_running"
  | "error"
  | "sleeping";

export const ORB_STATES: HugoOrbState[] = [
  "idle",
  "auth_required",
  "connecting",
  "listening",
  "thinking",
  "speaking",
  "interrupted",
  "tool_running",
  "error",
  "sleeping",
];

export type ConversationMode = "voice" | "text" | "mixed";
export type ConversationStatus = "active" | "archived" | "deleted";
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageModality = "text" | "audio" | "tool";

export type VoiceSessionStatus =
  | "created"
  | "connecting"
  | "active"
  | "ended"
  | "failed";

export type ToolApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "denied";

export type MemoryType = "preference" | "profile" | "project" | "instruction";

export type UsageEventType =
  | "text_message"
  | "assistant_response"
  | "voice_session"
  | "tool_call"
  | "model_fallback";

/** Response shape of POST /api/realtime/token (client-safe — never includes keys). */
export interface RealtimeSessionConfig {
  voice: string;
  instructions?: string;
  inputAudioTranscription?: Record<string, never>;
  turnDetection: { type: "server-vad" };
}

export interface RealtimeTokenResponse {
  expiresAt: number;
  token: string;
  url: string;
  model: string;
  voiceSessionId: string;
  conversationId: string;
  sessionConfig: RealtimeSessionConfig;
  tools: Experimental_RealtimeToolDefinition[];
}

/** Tool metadata that is safe to send to the browser (no execute fn, no secrets). */
export interface ClientSafeToolDefinition {
  name: string;
  description: string;
  requiresApproval: boolean;
}

export interface UsageLimits {
  dailyVoiceMinutes: number;
  dailyTextMessages: number;
}

export interface UserPreferences {
  theme?: "dark" | "light" | "system";
  voice?: string;
  conciseVoice?: boolean;
  reducedMotion?: boolean;
  /** Preferred `provider/model` for text chat (falls back to global default). */
  preferredTextModel?: string;
  /** Preferred `provider/model` for realtime voice (falls back to global default). */
  preferredRealtimeModel?: string;
}

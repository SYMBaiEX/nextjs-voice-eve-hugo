/**
 * Hugo constants — single source of truth for models, limits, roles, and
 * brand metadata. Values that may be overridden at runtime (models, voice,
 * limits) read from environment variables with production-safe defaults.
 *
 * NOTE: Only `NEXT_PUBLIC_*` values are safe to import into client components.
 * The server-only values below (admin email, gateway model defaults used by
 * routes) are read in server code; never import a secret here.
 */

export const APP_NAME = "Hugo";
export const APP_TAGLINE = "A realtime AI voice agent built on the Vercel AI stack.";
export const APP_DESCRIPTION =
  "Speak naturally. Interrupt freely. Continue in chat. Everything syncs in real time.";

/**
 * Selectable models (client-safe). These are plain `provider/model` strings
 * routed through the Vercel AI Gateway, so the set is easy to curate for a
 * bring-your-own-key / open-source deployment. The first entry is the default
 * shown when a user hasn't picked one; the routes fall back to the admin/global
 * default then the env default if a preference is unset.
 */
export interface ModelOption {
  id: string;
  label: string;
  hint?: string;
}

export const AVAILABLE_TEXT_MODELS: readonly ModelOption[] = [
  { id: "openai/gpt-5.5", label: "GPT-5.5", hint: "OpenAI · balanced default" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", hint: "OpenAI · fast & cheap" },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", hint: "Anthropic" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Google" },
  { id: "xai/grok-4", label: "Grok 4", hint: "xAI" },
  { id: "moonshotai/kimi-k2", label: "Kimi K2", hint: "Moonshot · open weights" },
] as const;

/** Realtime voice models supported by the AI Gateway realtime endpoint. */
export const AVAILABLE_REALTIME_MODELS: readonly ModelOption[] = [
  { id: "openai/gpt-realtime-2", label: "GPT Realtime 2", hint: "OpenAI · default" },
  { id: "openai/gpt-realtime-1.5", label: "GPT Realtime 1.5", hint: "OpenAI" },
  { id: "openai/gpt-realtime-mini", label: "GPT Realtime mini", hint: "OpenAI · fast" },
  { id: "xai/grok-voice-think-fast-1.0", label: "Grok Voice", hint: "xAI" },
] as const;

/** Default admin — granted the admin role automatically on first sign-in. */
export const DEFAULT_ADMIN_EMAIL = (
  process.env.DEFAULT_ADMIN_EMAIL ?? "solsymbaiex@gmail.com"
).toLowerCase();

/** Model + voice defaults (admin-configurable via systemSettings at runtime). */
export const DEFAULT_REALTIME_MODEL =
  process.env.DEFAULT_REALTIME_MODEL ?? "openai/gpt-realtime-2";
export const DEFAULT_TEXT_MODEL = process.env.DEFAULT_TEXT_MODEL ?? "openai/gpt-5.5";
export const DEFAULT_VOICE = process.env.DEFAULT_VOICE ?? "alloy";

/** Guest preview of the live experience (off by default per PRD security posture). */
export const ENABLE_GUEST_PREVIEW =
  (process.env.ENABLE_GUEST_PREVIEW ?? "false") === "true";

/** Per-user daily limits (enforced server-side; mirrored to Convex defaults). */
export const DAILY_VOICE_MINUTES_LIMIT = Number(
  process.env.DAILY_VOICE_MINUTES_LIMIT ?? 30,
);
export const DAILY_TEXT_MESSAGES_LIMIT = Number(
  process.env.DAILY_TEXT_MESSAGES_LIMIT ?? 200,
);

/** Rate limit for realtime token minting (per user, sliding window). */
export const REALTIME_TOKEN_RATE = { max: 10, windowMs: 60_000 } as const;

/** Rate limit for realtime tool executions (per user + voice session). */
export const REALTIME_TOOL_RATE = { max: 30, windowMs: 60_000 } as const;

/** Realtime browser token TTL hint (informational; the gateway controls actual TTL). */
export const REALTIME_TOKEN_TTL_SECONDS = 60;

/** Voices exposed in the UI. The gateway/model determines true availability. */
export const VOICE_OPTIONS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;
export type VoiceOption = (typeof VOICE_OPTIONS)[number];

/** Model options offered to admins in Settings. */
export const REALTIME_MODEL_OPTIONS = [
  "openai/gpt-realtime-2",
  "openai/gpt-realtime",
  "xai/grok-voice-think-fast-1.0",
] as const;

export const TEXT_MODEL_OPTIONS = [
  "openai/gpt-5.5",
  "openai/gpt-5.5-mini",
  "anthropic/claude-sonnet-4.6",
  "google/gemini-3.1-pro-preview",
] as const;

/** Roles. */
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Brand palette (kept in sync with app/globals.css; used by charts/orb in JS). */
export const PALETTE = {
  cyan: "#67e8f9",
  blue: "#38bdf8",
  magenta: "#f472b6",
  warning: "#facc15",
  error: "#fb7185",
  success: "#34d399",
  muted: "#6b6b74",
  textSecondary: "#a1a1aa",
} as const;

/** Rough per-unit cost estimates (USD) for the usage/cost dashboard.
 *  These are display-only estimates; real spend comes from AI Gateway. */
export const COST_ESTIMATES = {
  textInputPer1k: 0.0025,
  textOutputPer1k: 0.01,
  audioInputPerMin: 0.06,
  audioOutputPerMin: 0.24,
} as const;

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

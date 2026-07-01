import { z } from "zod";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Role, UserPreferences } from "@/lib/types";
import { getUserTinyfishKey } from "@/lib/tinyfish";

/**
 * Hugo's tool business logic (PRD 5.10) — framework-agnostic, shared by both
 * runtimes that invoke Hugo. No `import "server-only"` here (deliberately —
 * Eve's own bundler compiles this file too, and that marker's package throws
 * outside Next's special resolution); the actual server-only boundary is each
 * consumer: every Next.js route handler that reaches this, and
 * `hugo-agent/tools/index.ts` below, both already server-only by construction.
 *
 * - the in-process AI SDK stack (`hugo-agent/tools/index.ts`, a thin `tool()`
 *   wrapper over this module), used by voice and by BYOK text chat;
 * - the Eve durable runtime (`agent/tools/*.ts`, a thin `defineTool()` wrapper
 *   over this module), used by keyless/admin text chat.
 *
 * Each entry in `TOOL_DEFS` is `{ description, inputSchema (zod, valid for
 * both AI SDK and Eve's Standard Schema), logic }`. `logic` takes an explicit
 * `HugoToolContext` + validated args and returns the tool's output — no
 * framework types leak in here. Every invocation is logged to the `toolCalls`
 * ledger (start + result/error) via `logged()`, wrapping `logic` the same way
 * regardless of caller.
 */

export interface HugoToolContext {
  token: string;
  conversationId?: Id<"conversations">;
  role?: Role;
}

/** Wrap a tool's logic fn with start/complete logging to Convex. */
export function logged<TArgs, TOutput>(
  ctx: HugoToolContext,
  toolName: string,
  fn: (args: TArgs) => Promise<TOutput>,
) {
  return async (args: TArgs) => {
    let toolCallId: Id<"toolCalls"> | undefined;
    try {
      toolCallId = await fetchMutation(
        api.toolCalls.log,
        { toolName, conversationId: ctx.conversationId, input: redact(args) },
        { token: ctx.token },
      );
    } catch {
      // Logging is best-effort; never block the tool on it.
    }
    try {
      const output = await fn(args);
      if (toolCallId) {
        await fetchMutation(
          api.toolCalls.complete,
          { toolCallId, output: redact(output) },
          { token: ctx.token },
        ).catch(() => {});
      }
      return output;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (toolCallId) {
        await fetchMutation(
          api.toolCalls.complete,
          { toolCallId, error: message },
          { token: ctx.token },
        ).catch(() => {});
      }
      return { error: message } as TOutput;
    }
  };
}

/** Shallow redaction of obviously-sensitive keys before persisting tool I/O. */
export function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const SENSITIVE = /token|secret|password|key|authorization/i;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v);
  }
  return out;
}

/** WMO weather-interpretation codes (the standard table Open-Meteo returns). */
const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

/** Geocode a place name, then fetch current conditions — both via Open-Meteo
 *  (free, no API key). Framework- and provider-agnostic, so both the weather
 *  tool AND its Eve counterpart call this same function. */
async function getWeatherForLocation(
  location: string,
  unit: "fahrenheit" | "celsius",
): Promise<
  | {
      location: string;
      country: string | null;
      temperature: number;
      temperatureUnit: string;
      conditions: string;
      windSpeed: number;
      windSpeedUnit: string;
      humidityPercent: number;
      observedAt: string;
    }
  | { error: string }
> {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", location);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "en");
  geoUrl.searchParams.set("format", "json");

  const geoRes = await fetch(geoUrl).catch(() => null);
  const geo = await geoRes?.json().catch(() => null);
  const place = geo?.results?.[0] as
    | { name?: string; country_code?: string; latitude?: number; longitude?: number }
    | undefined;
  if (!place?.latitude || !place.longitude) {
    return { error: `Couldn't find a location matching "${location}".` };
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m",
  );
  forecastUrl.searchParams.set("temperature_unit", unit);
  forecastUrl.searchParams.set(
    "wind_speed_unit",
    unit === "fahrenheit" ? "mph" : "kmh",
  );

  const wxRes = await fetch(forecastUrl).catch(() => null);
  const wx = await wxRes?.json().catch(() => null);
  const current = wx?.current as
    | {
        time?: string;
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        relative_humidity_2m?: number;
      }
    | undefined;
  if (current?.temperature_2m === undefined) {
    return { error: "Couldn't fetch current weather right now." };
  }

  return {
    location: place.name ?? location,
    country: place.country_code ?? null,
    temperature: current.temperature_2m,
    temperatureUnit: unit === "fahrenheit" ? "°F" : "°C",
    conditions: WMO_CODES[current.weather_code ?? -1] ?? "Unknown",
    windSpeed: current.wind_speed_10m ?? 0,
    windSpeedUnit: unit === "fahrenheit" ? "mph" : "km/h",
    humidityPercent: current.relative_humidity_2m ?? 0,
    observedAt: current.time ?? new Date().toISOString(),
  };
}

interface TinyfishResult {
  position?: number;
  site_name?: string;
  title?: string;
  snippet?: string;
  url?: string;
}

interface TinyfishSearchResponse {
  query?: string;
  results?: TinyfishResult[];
  total_results?: number;
  page?: number;
}

/** Search the web via TinyFish (BYOK — admin uses the server key, everyone
 *  else brings their own key from Settings). Framework-agnostic so both the
 *  search tool AND its Eve counterpart call this same function. */
async function searchTheWeb(
  token: string,
  query: string,
  domainType: "web" | "news" | "research_paper",
  limit: number,
): Promise<
  | {
      query: string;
      results: { title: string; url: string; snippet: string; siteName: string }[];
      totalResults: number;
    }
  | { error: string }
> {
  const { apiKey, configured } = await getUserTinyfishKey(token);
  if (!configured || !apiKey) {
    return {
      error:
        "Web search isn't set up yet — add a TinyFish API key in Settings to enable it.",
    };
  }

  const url = new URL("https://api.search.tinyfish.ai");
  url.searchParams.set("query", query);
  url.searchParams.set("domain_type", domainType);

  const res = await fetch(url, { headers: { "X-API-Key": apiKey } }).catch(
    () => null,
  );
  if (!res?.ok) {
    return { error: "The web search provider is unavailable right now." };
  }
  const data = (await res.json().catch(() => null)) as
    | TinyfishSearchResponse
    | null;
  const results = Array.isArray(data?.results) ? data.results : [];

  return {
    query,
    results: results.slice(0, limit).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.snippet ?? "",
      siteName: r.site_name ?? "",
    })),
    totalResults: data?.total_results ?? results.length,
  };
}

/** One tool's shared shape: description + input schema + framework-agnostic
 *  logic. Generic over the SCHEMA itself (not just its inferred output) so the
 *  concrete Zod class survives end to end — Eve's `defineTool` picks its
 *  overload by structurally matching the actual schema type, and widening to
 *  the abstract `z.ZodType<TArgs>` base would make every tool resolve to the
 *  wrong (untyped) overload. */
interface ToolDef<TSchema extends z.ZodTypeAny, TOutput> {
  description: string;
  inputSchema: TSchema;
  logic: (ctx: HugoToolContext, args: z.infer<TSchema>) => Promise<TOutput>;
}

/** Type-erased view used only when iterating heterogeneously (see
 *  `getToolDef`) — each tool's own file/call site still gets the fully typed
 *  `TOOL_DEFS.<name>` entry; runtime validation (`inputSchema.parse`, done by
 *  the calling framework before `logic` ever runs) is the actual safety net
 *  for the generic loop case. */
type AnyToolDef = ToolDef<z.ZodTypeAny, unknown>;

function toolDef<TSchema extends z.ZodTypeAny, TOutput>(
  def: ToolDef<TSchema, TOutput>,
): ToolDef<TSchema, TOutput> {
  return def;
}

export const TOOL_DEFS = {
  getCurrentUserProfile: toolDef({
    description:
      "Get the signed-in user's profile and preferences (name, role, voice, theme).",
    inputSchema: z.object({}),
    logic: async (ctx) => {
      return await fetchQuery(api.users.currentUser, {}, { token: ctx.token });
    },
  }),

  getCurrentUsageSummary: toolDef({
    description:
      "Get the signed-in user's current-day limits and lifetime usage summary.",
    inputSchema: z.object({}),
    logic: async (ctx) => {
      const [today, lifetime] = await Promise.all([
        fetchQuery(api.usageEvents.todayForUser, {}, { token: ctx.token }),
        fetchQuery(api.usageEvents.summaryForUser, {}, { token: ctx.token }),
      ]);
      return { today, lifetime };
    },
  }),

  listUserMemories: toolDef({
    description:
      "List durable facts and preferences saved for the signed-in user.",
    inputSchema: z.object({
      type: z
        .enum(["preference", "profile", "project", "instruction"])
        .optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    logic: async (ctx, { type, limit }) => {
      const memories = await fetchQuery(
        api.memories.listOwn,
        { type, limit },
        { token: ctx.token },
      );
      return memories.map((m) => ({
        id: m._id,
        type: m.type,
        key: m.key,
        value: m.value,
        updatedAt: m.updatedAt,
      }));
    },
  }),

  getConversationTranscript: toolDef({
    description:
      "Read recent turns from the current or specified conversation the user can access.",
    inputSchema: z.object({
      conversationId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    logic: async (ctx, { conversationId, limit }) => {
      const target =
        (conversationId as Id<"conversations"> | undefined) ??
        ctx.conversationId;
      if (!target) return { error: "No conversation was provided." };
      const messages = await fetchQuery(
        api.messages.list,
        { conversationId: target, limit },
        { token: ctx.token },
      );
      return messages.map((m) => ({
        id: m._id,
        role: m.role,
        modality: m.modality,
        content: m.content,
        createdAt: m.createdAt,
      }));
    },
  }),

  updateUserPreferences: toolDef({
    description:
      "Update explicit profile preferences such as theme, voice, concise voice, or reduced motion.",
    inputSchema: z.object({
      theme: z.enum(["dark", "light", "system"]).optional(),
      voice: z.string().min(1).max(80).optional(),
      conciseVoice: z.boolean().optional(),
      reducedMotion: z.boolean().optional(),
    }),
    logic: async (ctx, preferences) => {
      const patch = preferences as Partial<UserPreferences>;
      await fetchMutation(
        api.users.updatePreferences,
        { preferences: patch },
        { token: ctx.token },
      );
      return { saved: true, preferences: patch };
    },
  }),

  getRecentConversationContext: toolDef({
    description:
      "Recall short summaries of the user's most recent conversations to ground the reply.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(10).default(5),
    }),
    logic: async (ctx, { limit }) => {
      const convos = await fetchQuery(
        api.conversations.list,
        { status: "active", limit },
        { token: ctx.token },
      );
      return convos.map((c) => ({
        id: c._id,
        title: c.title,
        mode: c.mode,
        summary: c.summary ?? null,
        lastMessageAt: c.lastMessageAt,
      }));
    },
  }),

  saveUserPreference: toolDef({
    description:
      "Save a durable user preference or fact to memory, keyed by a short stable key.",
    inputSchema: z.object({
      type: z
        .enum(["preference", "profile", "project", "instruction"])
        .default("preference"),
      key: z.string().min(1).max(80).describe("Short stable key, e.g. 'voice_pace'"),
      value: z.string().min(1).max(500),
    }),
    logic: async (ctx, { type, key, value }) => {
      await fetchMutation(
        api.memories.upsert,
        { type, key, value, sourceConversationId: ctx.conversationId },
        { token: ctx.token },
      );
      return { saved: true, key };
    },
  }),

  createConversationSummary: toolDef({
    description:
      "Store a concise summary of the current conversation for later retrieval.",
    inputSchema: z.object({
      summary: z.string().min(1).max(1200),
    }),
    logic: async (ctx, { summary }) => {
      if (!ctx.conversationId) {
        return { error: "No active conversation to summarize." };
      }
      await fetchMutation(
        api.conversations.setSummary,
        { conversationId: ctx.conversationId, summary },
        { token: ctx.token },
      );
      return { saved: true };
    },
  }),

  searchUserConversations: toolDef({
    description: "Search the user's own conversation history by keyword.",
    inputSchema: z.object({
      query: z.string().min(1).max(100),
      limit: z.number().int().min(1).max(20).default(10),
    }),
    logic: async (ctx, { query, limit }) => {
      const results = await fetchQuery(
        api.conversations.search,
        { queryText: query, limit },
        { token: ctx.token },
      );
      return results.map((c) => ({
        id: c._id,
        title: c.title,
        summary: c.summary ?? null,
        lastMessageAt: c.lastMessageAt,
      }));
    },
  }),

  getWeather: toolDef({
    description:
      "Get the current weather for a city or place name (temperature, conditions, wind, humidity).",
    inputSchema: z.object({
      location: z
        .string()
        .min(1)
        .max(120)
        .describe("A city or place name, e.g. 'Austin, TX' or 'Tokyo'."),
      unit: z.enum(["fahrenheit", "celsius"]).default("fahrenheit"),
    }),
    logic: async (_ctx, { location, unit }) => {
      return await getWeatherForLocation(location, unit);
    },
  }),

  searchWeb: toolDef({
    description:
      "Search the web for current information — news, facts, or research not in your training data.",
    inputSchema: z.object({
      query: z.string().min(1).max(400),
      domainType: z.enum(["web", "news", "research_paper"]).default("web"),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    logic: async (ctx, { query, domainType, limit }) => {
      return await searchTheWeb(ctx.token, query, domainType, limit);
    },
  }),

  // ---- Admin-only ----------------------------------------------------------

  getSystemUsageSummary: toolDef({
    description:
      "Admin-only: inspect global usage, cost, latency, model, and system health rollups.",
    inputSchema: z.object({
      days: z.number().int().min(1).max(90).default(14),
    }),
    logic: async (ctx, { days }) => {
      const [overview, usage] = await Promise.all([
        fetchQuery(api.admin.overview, {}, { token: ctx.token }),
        fetchQuery(api.usageEvents.globalSummary, { days }, { token: ctx.token }),
      ]);
      return { overview, usage };
    },
  }),

  getUserUsageSummary: toolDef({
    description:
      "Admin-only: inspect a specific user's conversation, voice, and cost totals.",
    inputSchema: z.object({
      userId: z.string().min(1),
    }),
    logic: async (ctx, { userId }) => {
      return await fetchQuery(
        api.admin.userUsageSummary,
        { userId: userId as Id<"users"> },
        { token: ctx.token },
      );
    },
  }),

  getVoiceSessionDiagnostics: toolDef({
    description:
      "Admin-only: inspect a voice session, related usage rows, and recent agent events.",
    inputSchema: z.object({
      voiceSessionId: z.string().min(1),
    }),
    logic: async (ctx, { voiceSessionId }) => {
      return await fetchQuery(
        api.voiceSessions.getDiagnostics,
        { voiceSessionId: voiceSessionId as Id<"voiceSessions"> },
        { token: ctx.token },
      );
    },
  }),
} as const;

export const USER_TOOL_NAMES = [
  "getCurrentUserProfile",
  "getCurrentUsageSummary",
  "listUserMemories",
  "getConversationTranscript",
  "updateUserPreferences",
  "getRecentConversationContext",
  "saveUserPreference",
  "createConversationSummary",
  "searchUserConversations",
  "getWeather",
  "searchWeb",
] as const;

export const ADMIN_TOOL_NAMES = [
  "getSystemUsageSummary",
  "getUserUsageSummary",
  "getVoiceSessionDiagnostics",
] as const;

export type ToolName = keyof typeof TOOL_DEFS;

/** `TOOL_DEFS` widened for generic iteration (see `AnyToolDef`). Both AI-SDK
 *  and Eve wrappers loop over a list of names and fetch each def by this. */
export function getToolDef(name: ToolName): AnyToolDef {
  return TOOL_DEFS[name];
}

import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Hugo data model (PRD 5.7).
 *
 * `authTables` provides Convex Auth's internal tables (authAccounts,
 * authSessions, authVerifiers, …) plus a base `users` table, which we redefine
 * below to add Hugo's profile/role fields. All cross-user access control is
 * enforced in the Convex functions (see convex/model/authz.ts), not here.
 */

const roleValidator = v.union(v.literal("user"), v.literal("admin"));
const userStatusValidator = v.union(v.literal("active"), v.literal("disabled"));

const preferencesValidator = v.optional(
  v.object({
    theme: v.optional(
      v.union(v.literal("dark"), v.literal("light"), v.literal("system")),
    ),
    voice: v.optional(v.string()),
    conciseVoice: v.optional(v.boolean()),
    reducedMotion: v.optional(v.boolean()),
  }),
);

const usageLimitsValidator = v.optional(
  v.object({
    dailyVoiceMinutes: v.number(),
    dailyTextMessages: v.number(),
  }),
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    // Convex Auth standard fields (kept optional to satisfy the auth runtime).
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // Hugo profile fields.
    authProviderId: v.optional(v.string()),
    role: roleValidator,
    status: userStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
    preferences: preferencesValidator,
    usageLimits: usageLimitsValidator,
  })
    .index("email", ["email"])
    .index("by_role", ["role"])
    .index("by_status", ["status"]),

  conversations: defineTable({
    userId: v.id("users"),
    title: v.string(),
    mode: v.union(v.literal("voice"), v.literal("text"), v.literal("mixed")),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("deleted"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastMessageAt: v.number(),
    summary: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_lastMessage", ["userId", "lastMessageAt"])
    .index("by_user_status_lastMessage", ["userId", "status", "lastMessageAt"])
    .index("by_status", ["status"])
    .index("by_status_lastMessage", ["status", "lastMessageAt"])
    .index("by_mode_lastMessage", ["mode", "lastMessageAt"])
    .index("by_status_mode_lastMessage", ["status", "mode", "lastMessageAt"])
    .index("by_lastMessage", ["lastMessageAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool"),
    ),
    modality: v.union(
      v.literal("text"),
      v.literal("audio"),
      v.literal("tool"),
    ),
    content: v.string(),
    transcript: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_conversation_source", ["conversationId", "sourceId"])
    .index("by_user", ["userId"]),

  voiceSessions: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    provider: v.string(),
    model: v.string(),
    voice: v.string(),
    status: v.union(
      v.literal("created"),
      v.literal("connecting"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("failed"),
    ),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    interruptionCount: v.number(),
    turnCount: v.number(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_user_started", ["userId", "startedAt"])
    .index("by_conversation", ["conversationId"])
    .index("by_status", ["status"])
    .index("by_status_started", ["status", "startedAt"])
    .index("by_started", ["startedAt"]),

  usageEvents: defineTable({
    userId: v.id("users"),
    conversationId: v.optional(v.id("conversations")),
    voiceSessionId: v.optional(v.id("voiceSessions")),
    type: v.string(),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    audioInputSeconds: v.optional(v.number()),
    audioOutputSeconds: v.optional(v.number()),
    estimatedCost: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_created", ["createdAt"])
    .index("by_conversation", ["conversationId"])
    .index("by_voiceSession", ["voiceSessionId"])
    .index("by_model", ["model"]),

  agentEvents: defineTable({
    userId: v.optional(v.id("users")),
    conversationId: v.optional(v.id("conversations")),
    voiceSessionId: v.optional(v.id("voiceSessions")),
    eventType: v.string(),
    status: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_conversation", ["conversationId"])
    .index("by_voiceSession", ["voiceSessionId"])
    .index("by_created", ["createdAt"])
    .index("by_eventType", ["eventType"]),

  toolCalls: defineTable({
    userId: v.id("users"),
    conversationId: v.optional(v.id("conversations")),
    toolName: v.string(),
    approvalStatus: v.union(
      v.literal("not_required"),
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
    ),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_conversation", ["conversationId"])
    .index("by_approvalStatus", ["approvalStatus"])
    .index("by_approvalStatus_started", ["approvalStatus", "startedAt"])
    .index("by_started", ["startedAt"]),

  memories: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("preference"),
      v.literal("profile"),
      v.literal("project"),
      v.literal("instruction"),
    ),
    key: v.string(),
    value: v.string(),
    sourceConversationId: v.optional(v.id("conversations")),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_user_key", ["userId", "key"]),

  adminAuditLogs: defineTable({
    adminUserId: v.id("users"),
    action: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_admin", ["adminUserId"])
    .index("by_created", ["createdAt"])
    .index("by_target", ["targetType", "targetId"]),

  systemSettings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});

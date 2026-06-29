Lets call this application "Hugo"

https://bklit.com/
nextjs 16+ (newest)
vercel ai sdk v7
https://vercel.com/docs/eve We should use eve for the agent
https://vercel.com/blog/realtime-voice-agents-on-ai-gateway for the voice

The main showcase here is the realtime voice agents on ai gateway.

Lets also use convex 

Hugo PRD

Production-Ready Jarvis-Style Realtime Voice Agent Built on the Vercel Native AI Stack

1. Product Summary

Hugo is a production-grade AI voice assistant application inspired by the “Jarvis” interaction pattern: a floating, ambient, intelligent orb that users can speak to naturally, interrupt, resume, and continue through text chat.

The core showcase is Vercel AI Gateway realtime voice agents, using Next.js 16+, AI SDK v7, Eve, Convex, and the broader Vercel Agent Stack. Hugo should feel like the most polished possible demonstration of the Vercel-native AI ecosystem as of June 29, 2026.

The product is not a generic chat app with voice bolted on. It is a voice-first AI operating layer with realtime speech, chat fallback, persistent memory, user accounts, admin controls, observability, usage tracking, and a futuristic dashboard aesthetic.

Default admin:

solsymbaiex@gmail.com

2. Product Vision

Hugo should feel like landing inside a minimal Vercel-native command center.

The user enters a clean page with a glowing orb floating in the center. The orb breathes, listens, thinks, speaks, and reacts in real time. A user can click the orb, begin speaking, interrupt Hugo mid-response, switch to text, review conversation history, and resume previous sessions.

For unauthenticated visitors, Hugo can show the interface and allow a constrained preview, but any real session, saved memory, tool execution, or admin-level interaction requires sign-in.

The application should demonstrate:

* Realtime voice agents through Vercel AI Gateway.
* AI SDK v7 realtime, chat, tool calling, speech, transcription, telemetry, and durable agent primitives.
* Eve as the backend agent framework.
* Convex as the realtime application database and state layer.
* Vercel-native deployment, observability, usage tracking, feature flags, security, and admin operations.
* A premium Jarvis-like interface without copying Iron Man IP directly.

3. Naming and Brand Direction

Product name: Hugo

Positioning:

Hugo is your realtime AI voice companion, built entirely on the Vercel AI stack.

Tone:

* Intelligent
* Calm
* Fast
* Technical
* Premium
* Ambient
* Slightly futuristic
* Not gimmicky

Avoid directly using copyrighted Iron Man or Jarvis branding in the app UI. The internal inspiration can be Jarvis, but the shipped language should describe Hugo as an ambient realtime AI voice agent.

4. Target Users

Primary User

A signed-in user who wants a fast, voice-first AI assistant that can answer questions, continue conversations, remember context, and eventually execute tools.

Admin User

An operator who needs to monitor users, conversations, voice sessions, model usage, errors, spend, latency, abuse signals, and system health.

Guest User

A visitor who lands on the home page and sees the Hugo orb. Guests can inspect the product and trigger sign-in prompts, but cannot create persistent sessions.

5. Core Product Requirements

5.1 Authentication and Roles

Hugo must support:

* User sign-up and sign-in.
* Persistent user profile records.
* Role-based access control.
* Admin dashboard access only for admins.
* Default admin assignment for solsymbaiex@gmail.com.
* Safe server-side role checks in Convex and Next.js route boundaries.
* User-level data isolation for conversations, sessions, memory, and usage.

Recommended auth architecture:

* Clerk or Better Auth may be used for sign-in.
* Convex stores canonical user profile, role, preferences, and usage metadata.
* On first sign-in, the system creates or syncs a Convex users record.
* If the email equals solsymbaiex@gmail.com, the user role is automatically set to admin.
* Admin role must also be enforceable from Convex functions, not only client-side UI.

Roles:

type Role = "user" | "admin";

Permissions:

Capability	Guest	User	Admin
View landing page	Yes	Yes	Yes
Preview orb UI	Yes	Yes	Yes
Start saved voice session	No	Yes	Yes
Text chat	No or limited preview	Yes	Yes
Conversation history	No	Own only	All
Memory	No	Own only	All / inspect
Tool execution	No	Approved tools only	All approved admin tools
Admin dashboard	No	No	Yes
Usage analytics	No	Own summary	Global
Session replay metadata	No	Own only	Global

5.2 Landing Page

The landing page is the main showcase.

Requirements:

* Full-screen, viewport-first layout.
* Floating Hugo orb centered or slightly above center.
* Minimal header with logo, sign-in button, and dashboard link when authenticated.
* Hero copy that explains realtime AI voice clearly.
* “Talk to Hugo” primary action.
* “Type instead” secondary action.
* If unauthenticated, clicking voice or chat opens a sign-in prompt.
* If authenticated, clicking voice opens a realtime session.
* Background should feel like a clean Vercel / Bklit-inspired command surface: dark and light modes, precise grids, subtle glow, data-like motion, and high contrast.
* No clutter.
* No mockup-looking placeholder panels.

Primary hero copy:

Meet Hugo.
A realtime AI voice agent built on the Vercel AI stack.
Speak naturally. Interrupt freely. Continue in chat. Everything syncs in real time.

Secondary copy:

Powered by Next.js 16, AI SDK 7, AI Gateway realtime voice, Eve, and Convex.

5.3 Hugo Orb

The orb is the primary UI object.

Orb states:

type HugoOrbState =
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

Visual behavior:

* idle: slow breathing animation.
* auth_required: soft locked pulse.
* connecting: ring spinner and faint waveform.
* listening: microphone-responsive waveform/rings.
* thinking: tighter inner rotation and subtle particles.
* speaking: audio-reactive glow and waveform.
* interrupted: quick ripple reset.
* tool_running: structured orbiting nodes.
* error: brief red/pink pulse, then recover.
* sleeping: dimmed orb.

Implementation guidance:

* Prefer Vercel AI Elements Persona or a custom Rive/WebGL orb for animated voice states.
* The orb must react to realtime session status from AI SDK v7.
* Motion should be smooth and not heavy enough to hurt performance.
* Respect reduced motion settings.

5.4 Realtime Voice Agent

This is the core feature.

Requirements:

* Browser-based microphone capture.
* Server-minted short-lived realtime token.
* Browser never receives the AI Gateway API key.
* AI Gateway realtime model routed through AI SDK v7.
* Default realtime model: openai/gpt-realtime-2.
* Configurable model for admins.
* Server VAD turn detection.
* Barge-in support so users can interrupt Hugo naturally.
* Realtime audio playback.
* Session lifecycle events stored in Convex.
* Realtime transcript stored as user and assistant turns.
* Tool calls supported mid-conversation where safe.
* Failed realtime connection falls back to text chat.

Session behavior:

1. User clicks “Talk to Hugo.”
2. App checks authentication.
3. Client requests a realtime token from /api/realtime/token.
4. Server verifies user and creates a voice session record.
5. Server mints short-lived AI Gateway realtime token.
6. Client connects with experimental_useRealtime.
7. User speaks.
8. Hugo responds in realtime audio.
9. Transcript and metadata stream into Convex.
10. Session can be paused, ended, resumed as text, or archived.

Realtime session config:

{
  voice: "alloy",
  turnDetection: {
    type: "server-vad"
  }
}

The default voice may be changed by admin configuration if the chosen provider supports it.

5.5 Text Chat

Text chat is the companion mode for voice.

Requirements:

* AI SDK v7 useChat or equivalent UI message stream.
* Persistent conversation history in Convex.
* Streaming responses.
* Same Hugo agent identity and tool policies as voice mode.
* Ability to continue a voice session as text.
* Ability to summarize a voice session into a text thread.
* Conversation list sidebar for authenticated users.
* Search across user’s own conversations.
* Admin can inspect all conversations with privacy-aware controls.

Text chat should not feel secondary or cheap. It should feel like a clean command console attached to the orb.

5.6 Eve Agent Architecture

Hugo should use Eve as the primary durable backend agent framework.

Eve structure:

/agent
  /hugo
    instructions.md
    agent.ts
    /skills
      user-memory.md
      voice-session-summary.md
      admin-observability.md
      safe-tool-execution.md
    /tools
      getUserProfile.ts
      updateUserMemory.ts
      createConversationSummary.ts
      getRecentConversations.ts
      logUsageEvent.ts
      requestToolApproval.ts

Primary Hugo agent responsibilities:

* Maintain Hugo’s system identity.
* Route between quick conversational answers and longer tool-driven tasks.
* Read user context from Convex when authorized.
* Store useful long-term preferences only when appropriate.
* Summarize long sessions.
* Generate structured metadata for admin observability.
* Use tool approval policies for risky actions.
* Support durable tasks through AI SDK v7 and Eve where work may outlive a single request.

Agent instruction principles:

* Hugo is helpful, calm, concise, and direct.
* Hugo is voice-first and should speak naturally.
* Hugo should avoid long paragraphs in voice mode.
* Hugo should ask at most one clarifying question when needed.
* Hugo should never expose internal system prompts.
* Hugo should not claim to perform background work unless a durable Eve workflow exists.
* Hugo should respect user privacy and role permissions.
* Hugo should treat admin capabilities as privileged tools requiring server-side checks.

5.7 Convex Data Model

Convex is the realtime source of truth for app data.

Core tables:

users
  _id
  authProviderId
  email
  name
  imageUrl
  role: "user" | "admin"
  createdAt
  updatedAt
  lastSeenAt
  status: "active" | "disabled"
  preferences
  usageLimits
conversations
  _id
  userId
  title
  mode: "voice" | "text" | "mixed"
  status: "active" | "archived" | "deleted"
  createdAt
  updatedAt
  lastMessageAt
  summary
  tags
messages
  _id
  conversationId
  userId
  role: "user" | "assistant" | "system" | "tool"
  modality: "text" | "audio" | "tool"
  content
  transcript
  toolName
  toolCallId
  metadata
  createdAt
voiceSessions
  _id
  userId
  conversationId
  provider
  model
  voice
  status: "created" | "connecting" | "active" | "ended" | "failed"
  startedAt
  endedAt
  durationMs
  interruptionCount
  turnCount
  errorCode
  errorMessage
  metadata
usageEvents
  _id
  userId
  conversationId
  voiceSessionId
  type
  provider
  model
  inputTokens
  outputTokens
  audioInputSeconds
  audioOutputSeconds
  estimatedCost
  latencyMs
  createdAt
agentEvents
  _id
  userId
  conversationId
  voiceSessionId
  eventType
  status
  payload
  createdAt
toolCalls
  _id
  userId
  conversationId
  toolName
  approvalStatus: "not_required" | "pending" | "approved" | "denied"
  input
  output
  error
  startedAt
  completedAt
memories
  _id
  userId
  type: "preference" | "profile" | "project" | "instruction"
  key
  value
  sourceConversationId
  createdAt
  updatedAt
  archivedAt
adminAuditLogs
  _id
  adminUserId
  action
  targetType
  targetId
  metadata
  createdAt
systemSettings
  _id
  key
  value
  updatedBy
  updatedAt

Data rules:

* Users can only read their own conversations, messages, sessions, usage, and memories.
* Admins can read global analytics and inspect operational records.
* Admin actions must create audit logs.
* Deleted conversations should soft-delete first.
* Sensitive fields should never be exposed to the client unless needed.
* API keys must only exist in server environment variables.

5.8 Admin Dashboard

The admin dashboard is a complete operating console.

Route:

/admin

Admin sections:

Overview

* Total users
* Active users today
* Voice sessions today
* Text conversations today
* Average latency
* Error rate
* Estimated AI spend
* Top models by usage
* Realtime connection failures
* Tool approval queue

Users

* User list
* Search by email/name
* Role
* Status
* Created date
* Last seen
* Total conversations
* Total voice minutes
* Estimated spend
* Disable/enable account
* Promote/demote admin, excluding protection for default owner unless explicitly allowed

Conversations

* Conversation list
* Filter by user, mode, date, model, status
* View transcript
* View voice session metadata
* View tool calls
* View summaries
* Flag conversation for review
* Archive/delete conversation as admin action

Voice Sessions

* Realtime session table
* Status
* Model
* Voice
* Duration
* Turn count
* Interruption count
* Error code
* Latency
* Audio seconds
* Session timeline

Usage and Cost

* Usage by day
* Usage by user
* Usage by model
* Estimated cost
* Budget alerts
* Abnormal usage detection
* Provider fallback events
* Spend limit configuration

Agent Events

* Eve workflow runs
* AI SDK tool calls
* Tool approval state
* Failed tool calls
* Long-running agent tasks
* System warnings

Settings

* Default realtime model
* Default text model
* Voice
* Guest preview enabled/disabled
* Per-user daily voice minute limit
* Per-user daily message limit
* Admin notification thresholds
* Tool approval policy
* Maintenance mode
* Feature flags

Audit Logs

* Admin action history
* Role changes
* Account disabling
* Settings changes
* Conversation access events
* Export events

Dashboard style:

* Inspired by Bklit-style data visualization: crisp charts, grid layouts, clean metrics, dark/light mode, precise spacing.
* Must feel native to a Vercel AI product.
* Charts should be useful, not decorative.

5.9 Tracking and Observability

Hugo must track all critical product and AI events.

Track:

* User signup
* User login
* Voice session started
* Voice session connected
* Voice session ended
* Voice session failed
* Barge-in/interruption count
* Text message sent
* Assistant response completed
* Tool call started
* Tool call completed
* Tool call failed
* Tool approval requested
* Tool approval accepted/denied
* Model fallback event
* Token usage
* Audio seconds
* Latency
* Estimated cost
* Admin action

Observability stack:

* Vercel Observability for app metrics.
* AI Gateway observability for model usage, latency, provider routing, and spend.
* AI SDK v7 telemetry through OpenTelemetry.
* Convex tables for application-level analytics.
* Admin dashboard as the internal operational view.

5.10 Tool System

Initial user-safe tools:

getCurrentUserProfile
getRecentConversationContext
saveUserPreference
createConversationSummary
searchUserConversations
logUsageEvent

Initial admin tools:

getSystemUsageSummary
getUserUsageSummary
getVoiceSessionDiagnostics
updateSystemSetting
disableUser
reviewToolCall

Tool safety:

* Read-only tools can be auto-approved.
* Mutating user-owned tools can be auto-approved only when scoped to the current user.
* Admin tools require admin role verification server-side.
* Destructive tools require explicit approval.
* Tool calls must be logged.
* Tool inputs and outputs should be redacted where needed.

5.11 API Routes and Server Boundaries

Required routes:

POST /api/realtime/token
POST /api/chat
POST /api/voice/session/start
POST /api/voice/session/end
POST /api/agent/hugo
GET  /api/admin/health

/api/realtime/token requirements:

* Requires authenticated user.
* Creates or attaches to a Convex voice session.
* Mints short-lived AI Gateway realtime token.
* Returns only token, URL, safe session config, and client-safe tool definitions.
* Never returns provider API keys.
* Applies user-level usage limits before issuing token.

/api/chat requirements:

* Requires authenticated user.
* Streams AI SDK v7 UI messages.
* Uses same Hugo instructions and tool policies.
* Stores user and assistant messages in Convex.
* Emits usage events.

5.12 Frontend Architecture

Recommended app structure:

/app
  /(marketing)
    page.tsx
  /(app)
    chat/page.tsx
    conversations/[id]/page.tsx
    settings/page.tsx
  /admin
    page.tsx
    users/page.tsx
    conversations/page.tsx
    voice-sessions/page.tsx
    usage/page.tsx
    settings/page.tsx
  /api
    realtime/token/route.ts
    chat/route.ts
/components
  /hugo
    HugoOrb.tsx
    HugoVoicePanel.tsx
    HugoChatPanel.tsx
    HugoSessionControls.tsx
    HugoTranscript.tsx
  /admin
    AdminMetricCard.tsx
    UsageChart.tsx
    VoiceSessionTable.tsx
    UserTable.tsx
    AuditLogTable.tsx
  /layout
    AppShell.tsx
    CommandMenu.tsx
    ThemeToggle.tsx
/lib
  ai.ts
  auth.ts
  convex.ts
  permissions.ts
  telemetry.ts
  usage.ts
  constants.ts
/convex
  schema.ts
  users.ts
  conversations.ts
  messages.ts
  voiceSessions.ts
  usageEvents.ts
  admin.ts
  settings.ts
/agent
  /hugo

Frontend principles:

* Server Components by default.
* Client Components only for interactive voice, chat, realtime state, and admin charts.
* Suspense boundaries for dynamic dashboard panels.
* Cache Components where safe.
* No secrets in client code.
* proxy.ts for route-level auth protection where appropriate.
* Turbopack default.
* React Compiler enabled once compatibility is validated.

5.13 UX Flows

First Visit

1. User lands on Hugo home.
2. Orb animates in idle mode.
3. User clicks “Talk to Hugo.”
4. If unauthenticated, sign-in modal appears.
5. After sign-in, user returns to the voice-ready state.

Voice Session

1. User clicks orb.
2. Orb enters connecting state.
3. Browser asks for microphone permission.
4. Realtime token is minted server-side.
5. Hugo connects.
6. Orb enters listening state.
7. User speaks.
8. Hugo responds with realtime voice.
9. Transcript appears subtly below or in side panel.
10. User can interrupt Hugo naturally.
11. User ends session.
12. Session summary is generated and stored.

Text Chat

1. User opens “Type instead.”
2. Chat panel opens.
3. User sends message.
4. Hugo streams response.
5. User can switch to voice from the same conversation.

Admin Review

1. Admin signs in.
2. Admin dashboard appears in navigation.
3. Admin views global metrics.
4. Admin drills into voice sessions.
5. Admin reviews failures, high usage, and tool calls.
6. Admin changes system settings.
7. Audit log records the change.

5.14 Design System

Visual style:

* Dark-first.
* Light mode supported.
* Vercel-inspired minimalism.
* Bklit-inspired charts and data panels.
* Futuristic command center.
* High contrast.
* Clean borders.
* Subtle glow.
* No excessive gradients.
* No skeuomorphic Iron Man UI.
* Premium monochrome base with controlled cyan, blue-white, and magenta accents.

Suggested palette:

Background dark: #050505
Surface dark: #0A0A0A
Surface elevated: #111111
Border: rgba(255,255,255,0.10)
Text primary: #F8FAFC
Text secondary: #A1A1AA
Hugo cyan: #67E8F9
Hugo blue: #38BDF8
Accent magenta: #F472B6
Warning: #FACC15
Error: #FB7185
Success: #34D399

Typography:

* Geist Sans for UI.
* Geist Mono for metrics, session IDs, technical labels, and logs.

UI components:

* shadcn-style primitives.
* Bklit-style charts for analytics.
* Vercel AI Elements for AI interaction UI where applicable.
* Rive/WebGL or AI Elements Persona for orb animation.

5.15 Voice Interaction Design

Hugo should speak in short, natural chunks.

Voice response rules:

* Prefer 1 to 3 sentences in voice mode.
* Use plain language.
* Do not read long tables aloud.
* Offer to show details visually when the answer is complex.
* Pause naturally.
* Recover gracefully if interrupted.
* Confirm destructive actions before executing tools.

Example Hugo voice personality:

Calm, precise, and useful. Hugo sounds like a focused technical operator, not a chatbot. It should be warm enough to feel personal, but never goofy or overly verbose.

5.16 Memory

Memory must be user-controlled and scoped.

Memory requirements:

* Store preferences only when useful.
* Allow users to view saved memory.
* Allow users to delete memory.
* Admins can inspect memory only for moderation, support, or debugging purposes.
* Memory should be included in agent context only for the authenticated user.
* Memory must never leak across users.

Memory examples:

User prefers concise answers.
User prefers voice responses to be slower.
User is building a Vercel-native AI app.
User prefers dark mode.

5.17 Security

Security requirements:

* Server-side auth checks everywhere.
* Convex function-level authorization.
* Admin role checked server-side.
* AI Gateway key never exposed to client.
* Realtime browser sessions use short-lived tokens only.
* Rate limits for voice token minting.
* Per-user daily usage limits.
* Abuse detection for repeated failed sessions or excessive spend.
* Audit logs for admin actions.
* Redaction of secrets in telemetry.
* No model prompt logging unless explicitly enabled for admin debugging.
* Tool approval policies for risky actions.
* Safe defaults for guest users.

5.18 Performance Requirements

Targets:

* Landing page loads fast with static shell.
* Voice connect should feel near-instant after permission.
* Orb animation should remain smooth on modern laptops and mobile.
* Text streaming should begin quickly.
* Admin dashboard should progressively load panels.
* Long analytics queries should be paginated or aggregated.
* Convex indexes required for userId, conversationId, createdAt, status, role, and session metadata.

5.19 Accessibility

Requirements:

* Full keyboard navigation.
* Captions/transcript for voice sessions.
* Text alternative for every voice interaction.
* Reduced motion mode.
* Color contrast compliant.
* Clear microphone permission state.
* Clear session recording/storage disclosure.
* Voice controls accessible by keyboard.
* Screen reader labels for orb state.

5.20 Compliance and Privacy

The app must clearly disclose:

* Voice input is processed by AI providers through AI Gateway.
* Transcripts may be stored for user history.
* Users can delete conversations.
* Users can delete memories.
* Admins may review sessions for support, abuse, and debugging.
* Provider routing may vary based on AI Gateway configuration.

5.21 Environment Variables

Required environment variables:

NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_CONVEX_URL=
CONVEX_DEPLOYMENT=
AI_GATEWAY_API_KEY=
AUTH_SECRET=
AUTH_PROVIDER_PUBLISHABLE_KEY=
AUTH_PROVIDER_SECRET_KEY=
DEFAULT_ADMIN_EMAIL=solsymbaiex@gmail.com
DEFAULT_REALTIME_MODEL=openai/gpt-realtime-2
DEFAULT_TEXT_MODEL=openai/gpt-5.5
DEFAULT_VOICE=alloy
ENABLE_GUEST_PREVIEW=false
DAILY_VOICE_MINUTES_LIMIT=30
DAILY_TEXT_MESSAGES_LIMIT=200

5.22 Model Strategy

Realtime voice:

openai/gpt-realtime-2 through AI Gateway

Text chat:

openai/gpt-5.5 or configured AI Gateway model

Fallback options:

* If realtime voice fails, fall back to text chat.
* If primary text model fails, use AI Gateway fallback routing.
* If speech generation is needed separately, use AI SDK v7 generateSpeech.
* If transcription of uploaded recordings is needed, use AI SDK v7 transcribe.

5.23 Production Acceptance Criteria

Hugo is production-ready when:

* A guest can land on the page and understand the product.
* A guest is prompted to sign in before real voice or chat usage.
* A signed-in user can start a realtime voice session.
* Hugo can listen, respond, and be interrupted in realtime.
* Voice transcripts are stored and visible.
* A signed-in user can continue the same session in text chat.
* Conversation history persists.
* User data is isolated.
* solsymbaiex@gmail.com is admin by default.
* Admin dashboard displays users, conversations, voice sessions, usage, cost, errors, settings, and audit logs.
* Admin actions are logged.
* AI Gateway API key is never exposed to the browser.
* Realtime tokens are short-lived and server-minted.
* Convex authorization blocks cross-user reads.
* Usage limits are enforced.
* Telemetry captures AI events, latency, usage, and errors.
* The UI is polished, responsive, accessible, and clearly voice-first.
* The app deploys cleanly on Vercel.

5.24 Final Build Direction

Build Hugo as a complete Vercel-native AI showcase:

* Next.js 16+ for the application shell, routing, Server Components, Cache Components, and production frontend architecture.
* AI SDK v7 for text streaming, realtime voice, tools, telemetry, speech, transcription, and agent primitives.
* AI Gateway for realtime voice, model routing, observability, fallback, budgets, and BYOK-compatible provider management.
* Eve for durable backend agent structure, tools, skills, and workflows.
* Convex for realtime app data, conversations, users, sessions, memory, usage, and admin state.
* Vercel Observability for platform-level monitoring.
* Bklit-inspired dashboard design for clean, premium analytics and admin operations.

Hugo should feel like a polished AI command center, not a demo. The orb is the product. Realtime voice is the showcase. The admin dashboard proves it is production-ready.
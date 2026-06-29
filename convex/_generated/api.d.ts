/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agentEvents from "../agentEvents.js";
import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as http from "../http.js";
import type * as memories from "../memories.js";
import type * as messages from "../messages.js";
import type * as model_authz from "../model/authz.js";
import type * as model_usage from "../model/usage.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as toolCalls from "../toolCalls.js";
import type * as usageEvents from "../usageEvents.js";
import type * as users from "../users.js";
import type * as voiceSessions from "../voiceSessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentEvents: typeof agentEvents;
  auth: typeof auth;
  conversations: typeof conversations;
  http: typeof http;
  memories: typeof memories;
  messages: typeof messages;
  "model/authz": typeof model_authz;
  "model/usage": typeof model_usage;
  seed: typeof seed;
  settings: typeof settings;
  toolCalls: typeof toolCalls;
  usageEvents: typeof usageEvents;
  users: typeof users;
  voiceSessions: typeof voiceSessions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

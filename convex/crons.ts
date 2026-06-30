import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled jobs (PRD 5.7).
 *
 * Backstops for cleanup the client can't guarantee. The browser ends a voice
 * session on every normal exit (the End button, navigation, a Voice→Text
 * switch, tab close via sendBeacon), but a crash or a dropped beacon can still
 * orphan one. This sweep finalizes any session stuck open past a generous
 * threshold so the admin console never shows phantom "active" sessions.
 *
 * Scheduled functions must be `internal.*` (never client-callable).
 */

const crons = cronJobs();

crons.interval(
  "end stale voice sessions",
  { minutes: 30 },
  internal.voiceSessions.endStale,
  {},
);

export default crons;

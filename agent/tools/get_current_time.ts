import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * `get_current_time` — the model sees this tool by its filename (snake_case).
 * A trivial, dependency-free tool that proves the Eve tool loop end to end.
 */
export default defineTool({
  description:
    "Get the current date and time, optionally for a given IANA time zone.",
  inputSchema: z.object({
    timeZone: z
      .string()
      .optional()
      .describe("IANA time zone, e.g. 'America/Chicago'. Defaults to UTC."),
  }),
  async execute({ timeZone }) {
    const now = new Date();
    try {
      const formatted = new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: timeZone ?? "UTC",
      }).format(now);
      return { iso: now.toISOString(), timeZone: timeZone ?? "UTC", formatted };
    } catch {
      // Unknown time zone — fall back to UTC rather than throwing.
      return {
        iso: now.toISOString(),
        timeZone: "UTC",
        formatted: now.toUTCString(),
        note: `Unknown time zone "${timeZone}"; used UTC.`,
      };
    }
  },
});

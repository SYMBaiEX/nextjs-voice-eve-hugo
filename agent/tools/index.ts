import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { TOOL_DEFS, logged } from "@/hugo-agent/tool-logic";
import { hugoToolContext, isAdminSession } from "@/agent/lib/session-auth";

/**
 * Admin-only tools, exposed conditionally (PRD 5.10) — mirrors
 * `hugo-agent/tools/index.ts`'s `if (ctx.role === "admin")` branch for the
 * in-process runtime. Resolved once at `session.started` (admin status is
 * stable for a session's lifetime, so no need to re-resolve per turn/step).
 */
export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      if (!isAdminSession(ctx)) return null;
      const hugoCtx = hugoToolContext(ctx);

      const systemUsage = TOOL_DEFS.getSystemUsageSummary;
      const userUsage = TOOL_DEFS.getUserUsageSummary;
      const voiceDiagnostics = TOOL_DEFS.getVoiceSessionDiagnostics;

      return {
        get_system_usage_summary: defineTool({
          description: systemUsage.description,
          inputSchema: systemUsage.inputSchema,
          async execute(input) {
            return await logged(
              hugoCtx,
              "getSystemUsageSummary",
              (args: z.infer<typeof systemUsage.inputSchema>) =>
                systemUsage.logic(hugoCtx, args),
            )(input);
          },
        }),
        get_user_usage_summary: defineTool({
          description: userUsage.description,
          inputSchema: userUsage.inputSchema,
          async execute(input) {
            return await logged(
              hugoCtx,
              "getUserUsageSummary",
              (args: z.infer<typeof userUsage.inputSchema>) =>
                userUsage.logic(hugoCtx, args),
            )(input);
          },
        }),
        get_voice_session_diagnostics: defineTool({
          description: voiceDiagnostics.description,
          inputSchema: voiceDiagnostics.inputSchema,
          async execute(input) {
            return await logged(
              hugoCtx,
              "getVoiceSessionDiagnostics",
              (args: z.infer<typeof voiceDiagnostics.inputSchema>) =>
                voiceDiagnostics.logic(hugoCtx, args),
            )(input);
          },
        }),
      };
    },
  },
});

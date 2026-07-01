import "server-only";
import { tool, type ToolSet } from "ai";
import {
  ADMIN_TOOL_NAMES,
  USER_TOOL_NAMES,
  getToolDef,
  logged,
  type HugoToolContext,
} from "@/hugo-agent/tool-logic";

export type { HugoToolContext };

/**
 * Hugo's user-safe tools, in AI-SDK `tool()` form — the in-process runtime
 * used by voice (`/api/realtime/tool`, `/api/realtime/token`) and by BYOK text
 * chat (`/api/chat`'s existing `streamText` path for users with their own AI
 * Gateway key). Keyless/admin text chat instead runs on the Eve durable
 * runtime (`agent/tools/*.ts`), a parallel thin wrapper over the SAME shared
 * logic in `hugo-agent/tool-logic.ts` — so every tool has exactly one
 * implementation regardless of which runtime invokes it.
 */
export function buildHugoTools(ctx: HugoToolContext): ToolSet {
  const tools: ToolSet = {};

  for (const name of USER_TOOL_NAMES) {
    const def = getToolDef(name);
    tools[name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: logged(ctx, name, (args) => def.logic(ctx, args)),
    });
  }

  if (ctx.role === "admin") {
    for (const name of ADMIN_TOOL_NAMES) {
      const def = getToolDef(name);
      tools[name] = tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: logged(ctx, name, (args) => def.logic(ctx, args)),
      });
    }
  }

  return tools;
}

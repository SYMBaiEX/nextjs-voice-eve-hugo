import { defineTool } from "eve/tools";
import { z } from "zod";
import { TOOL_DEFS, logged } from "@/hugo-agent/tool-logic";
import { hugoToolContext } from "@/agent/lib/session-auth";

const def = TOOL_DEFS.listTasks;

export default defineTool({
  description: def.description,
  inputSchema: def.inputSchema,
  async execute(input, eveCtx) {
    const ctx = hugoToolContext(eveCtx);
    return await logged(
      ctx,
      "listTasks",
      (args: z.infer<typeof def.inputSchema>) => def.logic(ctx, args),
    )(input);
  },
});

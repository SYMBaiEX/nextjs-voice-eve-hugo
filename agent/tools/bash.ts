import { disableTool } from "eve/tools";

// Showcase agent: the default-harness bash tool is disabled for safety —
// this demo only exposes its own safe tools (clock, calculator) + todo.
export default disableTool();

import { disableTool } from "eve/tools";

// The default-harness grep tool is disabled for safety — Hugo only exposes
// its own vetted tools (hugo-agent/tool-logic.ts), never raw filesystem/shell/
// network access to the model.
export default disableTool();

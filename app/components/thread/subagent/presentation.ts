const MESSAGE_TOOLS = new Set(["sendInput", "sendMessage", "followupTask"]);

export function collabToolLabelKey(tool: unknown) {
  return typeof tool === "string" ? `app.collabTool.${tool}` : "app.collabAgentToolCall";
}

export function subAgentActivityLabelKey(kind: unknown) {
  return typeof kind === "string" ? `app.subAgentActivityKind.${kind}` : "app.subAgentPanel";
}

export function collabToolHasMessage(tool: unknown) {
  return typeof tool === "string" && MESSAGE_TOOLS.has(tool);
}

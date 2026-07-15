/**
 * Shared helpers for presenting tool activity in the chat "Thought" panel.
 */

export function humanizeToolName(tool: string): string {
  return tool.replace(/^aidos_/, "").replace(/_/g, " ");
}

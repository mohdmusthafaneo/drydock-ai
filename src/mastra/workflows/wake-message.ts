import { buildChatContextMarkdown } from "@/lib/agent-chat/context";
import type { AgentWakeupSource } from "@/generated/prisma/client";

export type WakeMessageInput = {
  organizationId: string;
  agentId: string;
  runId: string;
  source: AgentWakeupSource;
  reason: string;
  payloadJson: string;
};

function parsePayload(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function isChatStreamingRun(input: {
  source: AgentWakeupSource;
  payloadJson: string;
}): string | undefined {
  const payload = parsePayload(input.payloadJson);
  const threadId =
    typeof payload.threadId === "string" ? payload.threadId : undefined;
  if (!threadId) return undefined;
  if (input.source === "chat") return threadId;
  if (input.source === "delegation") return threadId;
  return undefined;
}

export function isChatWakeup(input: {
  source: AgentWakeupSource;
  payloadJson: string;
}): boolean {
  return Boolean(isChatStreamingRun(input));
}

export async function renderWakeUserMessage(
  input: WakeMessageInput,
): Promise<string> {
  const payload = parsePayload(input.payloadJson);
  const threadId =
    typeof payload.threadId === "string" ? payload.threadId : undefined;

  if (threadId) {
    const chatContext = await buildChatContextMarkdown(
      input.organizationId,
      threadId,
      input.agentId,
    );
    if (chatContext) {
      const approvalLines =
        input.source === "approval" && typeof payload.approvalId === "string"
          ? [
              "",
              "## Approval decision",
              `- approvalId: ${payload.approvalId}`,
              `- decision: ${String(payload.decision ?? "unknown")}`,
              "- Resume the requested action if approved; post your result via aidos_post_thread_message.",
              "- If rejected, explain the outcome briefly in the thread.",
            ]
          : [];

      return [
        chatContext,
        "",
        "## Wake metadata",
        `- source: ${input.source}`,
        `- reason: ${input.reason}`,
        `- runId: ${input.runId}`,
        `- triggerMessageId: ${String(payload.triggerMessageId ?? "")}`,
        ...approvalLines,
        "",
        "Follow HEARTBEAT.md and skills/aidos/SKILL.md.",
        "Use tools for all mutations. Post thread replies via aidos_post_thread_message.",
        "Super Agent may close resolved threads via aidos_close_thread.",
        "Critical actions require aidos_request_approval before execution.",
        "When work is blocked pending human approval, summarize and stop.",
      ].join("\n");
    }
  }

  return [
    "## Heartbeat wake context",
    `- source: ${input.source}`,
    `- reason: ${input.reason}`,
    `- runId: ${input.runId}`,
    `- payload: ${JSON.stringify(payload)}`,
    "",
    "Follow HEARTBEAT.md and skills/aidos/SKILL.md.",
    "Use tools for all mutations. Include X-Run-Id on every write (handled by tools).",
    "When inbox is clear or work is blocked pending human approval, summarize and stop.",
  ].join("\n");
}

export type ChatRoutingMode =
  | "super_coordinator"
  | "specialist_direct"
  | "specialist_delegation";

export function resolveChatRoutingMode(input: {
  agentType: string;
  source: AgentWakeupSource;
  reason: string;
}): ChatRoutingMode {
  if (input.agentType !== "SUPER_ORCHESTRATOR") {
    return input.source === "delegation"
      ? "specialist_delegation"
      : "specialist_direct";
  }
  return "super_coordinator";
}

export function augmentUserMessageForRouting(
  userMessage: string,
  mode: ChatRoutingMode,
): string {
  const suffixByMode: Record<ChatRoutingMode, string> = {
    super_coordinator: [
      "",
      "## Routing mode: super_coordinator",
      "You are coordinating this operational thread. Invite specialists and delegate as needed.",
      "Do not answer domain questions yourself when a specialist is available.",
    ].join("\n"),
    specialist_direct: [
      "",
      "## Routing mode: specialist_direct",
      "A human @mentioned you or you are the direct chat target. Reply in-thread with your domain answer.",
    ].join("\n"),
    specialist_delegation: [
      "",
      "## Routing mode: specialist_delegation",
      "Super Agent delegated this thread wakeup to you. Read context, execute domain work, post via aidos_post_thread_message.",
    ].join("\n"),
  };

  return `${userMessage}${suffixByMode[mode]}`;
}

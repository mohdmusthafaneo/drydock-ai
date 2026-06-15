import type { AgentChatExternalSource } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ThreadMessagePostedEvent = {
  organizationId: string;
  threadId: string;
  messageId: string;
  contentMarkdown: string;
  externalSource: AgentChatExternalSource;
  externalChannelId?: string | null;
  externalThreadId?: string | null;
  authorAgentId?: string;
};

/**
 * Phase 5.6g outbound webhook stub — logs only; no Slack SDK.
 * Future: POST to org-configured webhook URL for Slack/Discord adapters.
 */
export async function emitThreadMessagePostedWebhook(
  event: ThreadMessagePostedEvent,
): Promise<void> {
  if (event.externalSource === "web") return;

  const payload = {
    type: "thread.message.posted",
    organizationId: event.organizationId,
    threadId: event.threadId,
    messageId: event.messageId,
    externalSource: event.externalSource,
    externalChannelId: event.externalChannelId ?? null,
    externalThreadId: event.externalThreadId ?? null,
    contentPreview: event.contentMarkdown.slice(0, 500),
    authorAgentId: event.authorAgentId ?? null,
    emittedAt: new Date().toISOString(),
  };

  console.info("[agent-chat webhook stub]", JSON.stringify(payload));

  await prisma.activityEvent.create({
    data: {
      organizationId: event.organizationId,
      type: "agent_chat.webhook.stub",
      title: "Outbound thread message webhook (stub)",
      description: `Would deliver reply to ${event.externalSource}`,
      metadataJson: JSON.stringify(payload),
    },
  });
}

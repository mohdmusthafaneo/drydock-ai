import { prisma } from "@/lib/prisma";

/**
 * Outbound webhook stub — logs only; no Slack SDK.
 * Retained for future external channel adapters.
 */
export async function emitThreadMessagePostedWebhook(event: {
  organizationId: string;
  threadId: string;
  messageId: string;
  contentMarkdown: string;
}): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      organizationId: event.organizationId,
      type: "agent_chat.webhook.stub",
      title: "Outbound thread message webhook (stub)",
      description: "Would deliver reply to an external channel",
      metadataJson: JSON.stringify({
        type: "thread.message.posted",
        threadId: event.threadId,
        messageId: event.messageId,
        contentPreview: event.contentMarkdown.slice(0, 500),
        emittedAt: new Date().toISOString(),
      }),
    },
  });
}

import type { Message, Thread } from "chat";
import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import type { SessionPayload } from "@/lib/session";
import {
  createAgentChatThread,
  postHumanChatMessage,
} from "@/lib/agent-chat/threads";
import { postAssistantChatMessage } from "@/lib/agent-chat/messages";
import { buildChatContextMarkdown } from "@/lib/agent-chat/context";
import { getMastra } from "@/mastra";
import { runAidosAssistant } from "@/mastra/workflows/run-assistant";
import {
  createAidosRequestContext,
  createAidosToolContext,
} from "@/mastra/tools/aidos/context";
import { AIDOS_ASSISTANT_INSTRUCTIONS } from "@/mastra/agents/aidos-assistant";
import { fetchSlackUser } from "@/lib/slack-oauth";
import { consumeSlackTurnBudget } from "@/lib/slack/budget";
import { getSlackRequestTenant } from "@/lib/slack/request-context";
import { logChatActivity, logChatAudit } from "@/lib/agent-chat/audit";

const EXTERNAL_SOURCE = "slack";

function truncateTitle(text: string, max = 80): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned || "Slack chat";
  return `${cleaned.slice(0, max - 1)}…`;
}

function extractPlainText(message: Message): string {
  const text = typeof message.text === "string" ? message.text : "";
  // Strip Slack bot mention tokens like <@U123>
  return text.replace(/<@[^>]+>/g, "").trim();
}

function decodeSlackThreadParts(threadId: string): {
  channelId: string;
  threadTs: string;
} | null {
  // Chat SDK Slack thread ids look like "slack:C123:1712345678.000100"
  const parts = threadId.split(":");
  if (parts.length < 3 || parts[0] !== "slack") return null;
  return { channelId: parts[1]!, threadTs: parts.slice(2).join(":") };
}

async function resolveSlackActor(input: {
  organizationId: string;
  slackUserId: string;
  botToken: string;
  emailHint?: string;
}): Promise<SessionPayload | null> {
  let email = input.emailHint?.trim().toLowerCase();
  if (!email) {
    const profile = await fetchSlackUser(input.botToken, input.slackUserId);
    email = profile?.profile?.email?.trim().toLowerCase();
  }
  if (!email) return null;

  const user = await prisma.user.findFirst({
    where: {
      organizationId: input.organizationId,
      email: { equals: email, mode: "insensitive" },
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organizationId: true,
    },
  });

  if (!user) return null;

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
  };
}

async function getOrCreateSlackThread(input: {
  organizationId: string;
  userId: string;
  externalThreadId: string;
  titleSeed: string;
}): Promise<string> {
  const existing = await prisma.agentChatThread.findFirst({
    where: {
      organizationId: input.organizationId,
      externalSource: EXTERNAL_SOURCE,
      externalThreadId: input.externalThreadId,
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await createAgentChatThread({
    organizationId: input.organizationId,
    userId: input.userId,
    title: truncateTitle(input.titleSeed),
  });

  if (!created.ok) {
    throw new Error(created.error || "Failed to create Slack chat thread");
  }

  await prisma.agentChatThread.update({
    where: { id: created.data.threadId },
    data: {
      externalSource: EXTERNAL_SOURCE,
      externalThreadId: input.externalThreadId,
    },
  });

  await prisma.$transaction(async (tx) => {
    await logChatActivity(tx, {
      organizationId: input.organizationId,
      type: "agent_chat.thread.linked_external",
      title: "Agent thread linked to Slack",
      metadata: {
        threadId: created.data.threadId,
        externalSource: EXTERNAL_SOURCE,
        externalThreadId: input.externalThreadId,
      },
    });
    await logChatAudit(tx, {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "agent_chat.thread.linked_external",
      entityType: "AgentChatThread",
      entityId: created.data.threadId,
      metadata: {
        externalSource: EXTERNAL_SOURCE,
        externalThreadId: input.externalThreadId,
      },
    });
  });

  return created.data.threadId;
}

/**
 * Governed Slack turn: identity gate → RBAC → budget → persist → assistant → reply.
 * Does not call Mastra's default channel handler.
 */
export async function runSlackAssistantTurn(
  thread: Thread,
  message: Message,
): Promise<void> {
  const tenant = getSlackRequestTenant();
  if (!tenant) {
    await thread.post(
      "AIDOS could not resolve this Slack workspace. Ask an admin to reconnect Slack in Integrations.",
    );
    return;
  }

  const parts = decodeSlackThreadParts(thread.id);
  if (!parts) {
    await thread.post("AIDOS could not parse this Slack thread.");
    return;
  }

  const content = extractPlainText(message);
  if (!content) {
    await thread.post("Send a question after mentioning AIDOS.");
    return;
  }

  const slackUserId = message.author?.userId;
  if (!slackUserId) {
    await thread.post("AIDOS could not identify the Slack user.");
    return;
  }

  const actor = await resolveSlackActor({
    organizationId: tenant.organizationId,
    slackUserId,
    botToken: tenant.botToken,
    emailHint: message.author?.email,
  });

  if (!actor) {
    await thread.post(
      "Your Slack account email is not linked to an active AIDOS user in this organization. Ask an admin to invite you, then try again.",
    );
    return;
  }

  if (!hasPermission(actor, "agents", "view")) {
    await thread.post(
      "Your AIDOS role does not have permission to use the assistant. Ask an org admin to grant Agents access.",
    );
    return;
  }

  const budget = await consumeSlackTurnBudget(tenant.organizationId);
  if (!budget.allowed) {
    await thread.post(
      `This organization has reached the Slack assistant limit (${budget.limit}/hour). Try again later or continue in the AIDOS app.`,
    );
    return;
  }

  const externalThreadId = `${parts.channelId}:${parts.threadTs}`;
  const threadId = await getOrCreateSlackThread({
    organizationId: tenant.organizationId,
    userId: actor.userId,
    externalThreadId,
    titleSeed: content,
  });

  const human = await postHumanChatMessage({
    organizationId: tenant.organizationId,
    userId: actor.userId,
    threadId,
    content,
  });
  if (!human.ok) {
    await thread.post("AIDOS could not save your message. Please try again.");
    return;
  }

  try {
    await thread.startTyping("Looking up AIDOS data…");
  } catch {
    // typing is best-effort
  }

  const contextMarkdown = await buildChatContextMarkdown({
    organizationId: tenant.organizationId,
    threadId,
  });

  const systemPrompt = [
    AIDOS_ASSISTANT_INSTRUCTIONS,
    "",
    "You are answering via Slack. Keep replies concise and markdown-friendly.",
    "Do not claim you executed changes. Recommend-only.",
    contextMarkdown ? `\n## Thread context\n${contextMarkdown}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const mastra = await getMastra();
  const requestContext = createAidosRequestContext(
    createAidosToolContext({ organizationId: tenant.organizationId }),
  );

  const result = await runAidosAssistant({
    mastra,
    organizationId: tenant.organizationId,
    systemPrompt,
    userMessage: content,
    requestContext,
  });

  const answer =
    result.summary.trim() ||
    "I could not produce an answer from available AIDOS data.";

  await postAssistantChatMessage({
    organizationId: tenant.organizationId,
    threadId,
    contentMarkdown: answer,
  });

  await thread.post(answer);
}

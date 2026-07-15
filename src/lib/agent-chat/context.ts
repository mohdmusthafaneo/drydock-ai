export const AGENT_CHAT_CONTEXT_LIMIT = Math.min(
  Math.max(parseInt(process.env.AGENT_CHAT_CONTEXT_LIMIT ?? "20", 10) || 20, 5),
  50,
);

/** Max omitted messages sampled when building an auto-digest beyond the window. */
export const AGENT_CHAT_OMITTED_SAMPLE_LIMIT = 15;

export type ContextMessage = {
  kind: string;
  contentMarkdown: string;
  authorUser: { name: string } | null;
  createdAt: Date;
};

export function formatMessageLine(m: ContextMessage): string {
  const author =
    m.kind === "human"
      ? m.authorUser?.name ?? "Human"
      : m.kind === "system"
        ? "System"
        : m.kind === "assistant" || m.kind === "agent_reply"
          ? "Assistant"
          : m.kind;
  const preview = m.contentMarkdown.trim().replace(/\n+/g, " ").slice(0, 500);
  return `- [${m.kind}] ${author}: ${preview}`;
}

/**
 * Split messages (newest-first) into the recent window and omitted older messages.
 */
export function partitionMessagesForContext<T extends ContextMessage>(
  messagesNewestFirst: T[],
  limit = AGENT_CHAT_CONTEXT_LIMIT,
): { recentOldestFirst: T[]; omittedOldestFirst: T[]; totalCount: number } {
  const totalCount = messagesNewestFirst.length;
  const recentNewestFirst = messagesNewestFirst.slice(0, limit);
  const omittedNewestFirst = messagesNewestFirst.slice(limit);
  return {
    recentOldestFirst: [...recentNewestFirst].reverse(),
    omittedOldestFirst: [...omittedNewestFirst].reverse(),
    totalCount,
  };
}

/**
 * Compact digest of messages outside the context window (oldest-first input).
 */
export function summarizeOmittedMessages(
  omittedOldestFirst: ContextMessage[],
  totalOmittedCount?: number,
): string {
  if (omittedOldestFirst.length === 0) return "";

  const omittedCount = totalOmittedCount ?? omittedOldestFirst.length;
  const lines = omittedOldestFirst.map(formatMessageLine);
  const digest = lines.join("\n");

  if (digest.length <= 1500 && omittedCount <= omittedOldestFirst.length) {
    return digest;
  }

  const sampleLines = lines.slice(0, AGENT_CHAT_OMITTED_SAMPLE_LIMIT);
  const remaining = omittedCount - sampleLines.length;
  if (remaining > 0) {
    return `${sampleLines.join("\n")}\n… (${remaining} more earlier message${remaining === 1 ? "" : "s"})`;
  }
  return `${digest.slice(0, 1500)}…`;
}

export type BuildChatContextSectionsInput = {
  thread: {
    id: string;
    status: string;
    title: string;
    contextSummary?: string | null;
  };
  recentOldestFirst: ContextMessage[];
  omittedDigest?: string;
};

/** Pure section builder — used by buildChatContextMarkdown and unit tests. */
export function buildChatContextSections(input: BuildChatContextSectionsInput): string {
  const { thread, recentOldestFirst, omittedDigest } = input;

  const recentMessages = recentOldestFirst.map(formatMessageLine).join("\n");

  const taskLines = [
    "## Your task",
    "- You are the **AIDOS Assistant** for this conversation.",
    "- Answer the human directly in streamed natural language.",
    "- Ground claims with read-only tools before stating organization-specific facts.",
    "- Recommend-only: never claim you executed changes or deployments.",
  ];

  const priorSummaryBlock = thread.contextSummary?.trim()
    ? `\n## Prior context summary\n${thread.contextSummary.trim()}\n`
    : "";

  const omittedBlock =
    omittedDigest?.trim()
      ? `\n## Earlier messages (summarized, ${AGENT_CHAT_CONTEXT_LIMIT} most recent shown below)\n${omittedDigest.trim()}\n`
      : "";

  return [
    "## Chat thread",
    `- threadId: ${thread.id}`,
    `- status: ${thread.status}`,
    `- title: ${thread.title}`,
    priorSummaryBlock,
    omittedBlock,
    "## Recent messages",
    recentMessages || "(no messages yet)",
    "",
    ...taskLines,
  ].join("\n");
}

import { prisma } from "@/lib/prisma";

/** Load thread history and build markdown context for the assistant system prompt. */
export async function buildChatContextMarkdown(input: {
  organizationId: string;
  threadId: string;
}): Promise<string | null> {
  const thread = await prisma.agentChatThread.findFirst({
    where: { id: input.threadId, organizationId: input.organizationId },
    select: {
      id: true,
      status: true,
      title: true,
      contextSummary: true,
    },
  });
  if (!thread) return null;

  const messagesNewestFirst = await prisma.agentChatMessage.findMany({
    where: {
      organizationId: input.organizationId,
      threadId: input.threadId,
    },
    orderBy: { createdAt: "desc" },
    take: AGENT_CHAT_CONTEXT_LIMIT + AGENT_CHAT_OMITTED_SAMPLE_LIMIT,
    select: {
      kind: true,
      contentMarkdown: true,
      createdAt: true,
      authorUser: { select: { name: true } },
    },
  });

  const { recentOldestFirst, omittedOldestFirst } =
    partitionMessagesForContext(messagesNewestFirst);

  return buildChatContextSections({
    thread,
    recentOldestFirst,
    omittedDigest: summarizeOmittedMessages(omittedOldestFirst),
  });
}

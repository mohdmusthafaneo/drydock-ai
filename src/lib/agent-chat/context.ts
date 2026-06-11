import { prisma } from "@/lib/prisma";

export const AGENT_CHAT_CONTEXT_LIMIT = Math.min(
  Math.max(parseInt(process.env.AGENT_CHAT_CONTEXT_LIMIT ?? "20", 10) || 20, 5),
  50,
);

/** Max omitted messages sampled when building an auto-digest beyond the window. */
export const AGENT_CHAT_OMITTED_SAMPLE_LIMIT = 15;

export const MAX_SPECIALISTS_PER_THREAD = 5;

export type ContextMessage = {
  kind: string;
  contentMarkdown: string;
  authorUser: { name: string } | null;
  authorAgent: { displayName: string } | null;
  targetAgentId: string | null;
  createdAt: Date;
};

function participantLabel(p: {
  role: string;
  agent: { displayName: string } | null;
  user: { name: string } | null;
}): string {
  if (p.role === "human") return p.user?.name ? `@${p.user.name}` : "Human";
  if (p.agent) {
    const roleTag = p.role === "coordinator" ? "coordinator" : "specialist";
    return `${p.agent.displayName} (${roleTag})`;
  }
  return "Unknown";
}

export function formatMessageLine(m: ContextMessage): string {
  const author =
    m.kind === "human"
      ? m.authorUser?.name ?? "Human"
      : m.kind === "system"
        ? "System"
        : m.authorAgent?.displayName ?? "Agent";
  const target = m.targetAgentId ? ` → agent:${m.targetAgentId}` : "";
  const preview = m.contentMarkdown.trim().replace(/\n+/g, " ").slice(0, 500);
  return `- [${m.kind}] ${author}${target}: ${preview}`;
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
  participants: Array<{
    role: string;
    agent: { id: string; displayName: string; agentType: string } | null;
    user: { id: string; name: string } | null;
  }>;
  recentOldestFirst: ContextMessage[];
  omittedDigest?: string;
  actingAgentId?: string;
};

/** Pure section builder — used by buildChatContextMarkdown and unit tests. */
export function buildChatContextSections(input: BuildChatContextSectionsInput): string {
  const { thread, participants, recentOldestFirst, omittedDigest, actingAgentId } = input;

  const actingParticipant = actingAgentId
    ? participants.find((p) => p.agent?.id === actingAgentId)
    : undefined;

  const participantList = participants.map(participantLabel).join(", ");
  const recentMessages = recentOldestFirst.map(formatMessageLine).join("\n");

  const isCoordinator = actingParticipant?.role === "coordinator";
  const isSpecialist = actingParticipant?.role === "specialist";

  const taskLines = [
    "## Your task",
    isCoordinator
      ? "- You are the **Super Agent coordinator** for this thread."
      : isSpecialist
        ? "- You are an **invited specialist** in this thread."
        : "- You are participating in this agent chat thread.",
    isCoordinator
      ? "- Triage the human request, invite specialists with `aidos_invite_agent_to_thread`, then delegate with `aidos_delegate_wakeup` (include `threadId` and `triggerMessageId` in payload). You may invite and delegate to multiple specialists in one heartbeat when work is parallel."
      : "- Answer the human's question using your tools; post your reply with `aidos_post_thread_message`.",
    isCoordinator
      ? "- Assess specialist replies; post an optional synthesis via `aidos_post_thread_message` when multiple specialists contributed. Close with `aidos_close_thread` when resolved; reopen with `aidos_reopen_thread` if needed."
      : "- Do not invite other agents or close the thread. Use `aidos_await_human_input` when you need clarification from the human.",
    "- Critical mutations require `aidos_request_approval` (Phase 5.6e); do not bypass governance.",
    "- Post visible replies via `aidos_post_thread_message` — do not rely on run summary alone.",
  ];

  const priorSummaryBlock = thread.contextSummary?.trim()
    ? `\n## Prior context summary\n${thread.contextSummary.trim()}\n`
    : "";

  const omittedBlock =
    omittedDigest?.trim()
      ? `\n## Earlier messages (summarized, ${AGENT_CHAT_CONTEXT_LIMIT} most recent shown below)\n${omittedDigest.trim()}\n`
      : "";

  return [
    "## Agent chat thread",
    `- threadId: ${thread.id}`,
    `- status: ${thread.status}`,
    `- title: ${thread.title}`,
    `- participants: ${participantList}`,
    `- context window: last ${AGENT_CHAT_CONTEXT_LIMIT} messages`,
    priorSummaryBlock,
    omittedBlock,
    "## Recent messages (oldest first)",
    recentMessages || "(no messages yet)",
    "",
    ...taskLines,
  ].join("\n");
}

/**
 * Build compact markdown context for LLM user message when processing a chat wakeup.
 */
export async function buildChatContextMarkdown(
  organizationId: string,
  threadId: string,
  actingAgentId?: string,
): Promise<string | null> {
  const [thread, totalMessageCount] = await Promise.all([
    prisma.agentChatThread.findFirst({
      where: { id: threadId, organizationId },
      include: {
        participants: {
          orderBy: { invitedAt: "asc" },
          include: {
            agent: { select: { id: true, displayName: true, agentType: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.agentChatMessage.count({
      where: { threadId, organizationId },
    }),
  ]);

  if (!thread) return null;

  const recentMessages = await prisma.agentChatMessage.findMany({
    where: { threadId, organizationId },
    orderBy: { createdAt: "desc" },
    take: AGENT_CHAT_CONTEXT_LIMIT,
    include: {
      authorUser: { select: { name: true } },
      authorAgent: { select: { displayName: true } },
    },
  });

  let omittedDigest: string | undefined;
  const omittedCount = totalMessageCount - recentMessages.length;
  if (omittedCount > 0) {
    const omittedSample = await prisma.agentChatMessage.findMany({
      where: { threadId, organizationId },
      orderBy: { createdAt: "asc" },
      take: Math.min(omittedCount, AGENT_CHAT_OMITTED_SAMPLE_LIMIT),
      include: {
        authorUser: { select: { name: true } },
        authorAgent: { select: { displayName: true } },
      },
    });
    omittedDigest = summarizeOmittedMessages(omittedSample, omittedCount);
  }

  const { recentOldestFirst } = partitionMessagesForContext(recentMessages);

  return buildChatContextSections({
    thread,
    participants: thread.participants,
    recentOldestFirst,
    omittedDigest,
    actingAgentId,
  });
}

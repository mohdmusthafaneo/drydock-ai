import { prisma } from "@/lib/prisma";

export const AGENT_CHAT_CONTEXT_LIMIT = Math.min(
  Math.max(parseInt(process.env.AGENT_CHAT_CONTEXT_LIMIT ?? "20", 10) || 20, 5),
  50,
);

export const MAX_SPECIALISTS_PER_THREAD = 5;

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

function formatMessageLine(m: {
  kind: string;
  contentMarkdown: string;
  authorUser: { name: string } | null;
  authorAgent: { displayName: string } | null;
  targetAgentId: string | null;
  createdAt: Date;
}): string {
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
 * Build compact markdown context for LLM user message when processing a chat wakeup.
 */
export async function buildChatContextMarkdown(
  organizationId: string,
  threadId: string,
  actingAgentId?: string,
): Promise<string | null> {
  const thread = await prisma.agentChatThread.findFirst({
    where: { id: threadId, organizationId },
    include: {
      participants: {
        orderBy: { invitedAt: "asc" },
        include: {
          agent: { select: { id: true, displayName: true, agentType: true } },
          user: { select: { id: true, name: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: AGENT_CHAT_CONTEXT_LIMIT,
        include: {
          authorUser: { select: { name: true } },
          authorAgent: { select: { displayName: true } },
        },
      },
    },
  });

  if (!thread) return null;

  const actingParticipant = actingAgentId
    ? thread.participants.find((p) => p.agentId === actingAgentId)
    : undefined;

  const participantList = thread.participants.map(participantLabel).join(", ");
  const recentMessages = [...thread.messages]
    .reverse()
    .map(formatMessageLine)
    .join("\n");

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
      ? "- Triage the human request, invite specialists with `aidos_invite_agent_to_thread`, then delegate with `aidos_delegate_wakeup` (include `threadId` and `triggerMessageId` in payload)."
      : "- Answer the human's question using your tools; post your reply with `aidos_post_thread_message`.",
    isCoordinator
      ? "- Assess specialist replies; synthesize when helpful. Only you may close threads (Phase 5.6d)."
      : "- Do not invite other agents or close the thread.",
    "- Critical mutations require `aidos_request_approval` (Phase 5.6e); do not bypass governance.",
    "- Post visible replies via `aidos_post_thread_message` — do not rely on run summary alone.",
  ];

  const summaryBlock = thread.contextSummary?.trim()
    ? `\n## Prior context summary\n${thread.contextSummary.trim()}\n`
    : "";

  return [
    "## Agent chat thread",
    `- threadId: ${thread.id}`,
    `- status: ${thread.status}`,
    `- title: ${thread.title}`,
    `- participants: ${participantList}`,
    summaryBlock,
    "## Recent messages (oldest first)",
    recentMessages || "(no messages yet)",
    "",
    ...taskLines,
  ].join("\n");
}

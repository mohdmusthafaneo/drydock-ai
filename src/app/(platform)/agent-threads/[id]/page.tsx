import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAgentChatThread } from "@/lib/agent-chat";
import { ThreadStatusBadge } from "@/components/agent-chat/thread-status-badge";
import { MessageTimeline } from "@/components/agent-chat/message-timeline";
import { ComposeBox } from "@/components/agent-chat/compose-box";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AgentThreadDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!dna) redirect("/governance/setup");

  const { id } = await params;
  const thread = await getAgentChatThread(session.organizationId, id);

  if (!thread) notFound();

  const participantLabels = thread.participants
    .map((p) => {
      if (p.role === "human") return p.user?.name ?? "Human";
      return p.agent?.displayName ?? "Agent";
    })
    .join(" · ");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 lg:max-w-4xl">
      <div>
        <Link href="/agent-threads" className="text-sm text-[#93b4ff] hover:underline">
          ← Agent threads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold sm:text-2xl">{thread.title}</h1>
          <ThreadStatusBadge status={thread.status} />
        </div>
        {participantLabels && (
          <p className="mt-1 text-xs text-slate-500">Participants: {participantLabels}</p>
        )}
      </div>

      <div className="flex min-h-[50vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#131A2A]/30">
        <div className="flex-1 overflow-y-auto p-4">
          <MessageTimeline messages={thread.messages} />
        </div>
        <ComposeBox threadId={thread.id} />
      </div>
    </div>
  );
}

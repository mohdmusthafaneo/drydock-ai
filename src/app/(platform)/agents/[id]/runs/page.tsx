import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AgentRunsTable } from "@/components/agents/agent-runs-table";
import { displayAgentStatus } from "@/lib/agent-control-plane/display";

type PageProps = { params: Promise<{ id: string }> };

export default async function AgentRunsPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true, displayName: true, status: true },
  });

  if (!agent) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/agents"
          className="text-sm font-medium text-ink underline-offset-4 hover:underline"
        >
          ← Back to agents
        </Link>
        <h1 className="mt-2 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink sm:text-[32px]">
          {agent.displayName} — runs
        </h1>
        <p className="mt-1 text-ash">
          Heartbeat history · status {displayAgentStatus(agent.status)}
        </p>
      </div>

      <AgentRunsTable
        agentId={agent.id}
        agentDisplayName={agent.displayName}
        agentStatus={displayAgentStatus(agent.status)}
      />
    </div>
  );
}

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AgentRunDetailPanel } from "@/components/agents/agent-run-detail-panel";

type PageProps = { params: Promise<{ id: string; runId: string }> };

export default async function AgentRunDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id, runId } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });

  if (!agent) notFound();

  const run = await prisma.agentHeartbeatRun.findFirst({
    where: {
      id: runId,
      agentId: id,
      organizationId: session.organizationId,
    },
    select: { id: true },
  });

  if (!run) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/agents/${id}/runs`}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Back to run history
        </Link>
      </div>

      <AgentRunDetailPanel agentId={id} runId={runId} />
    </div>
  );
}

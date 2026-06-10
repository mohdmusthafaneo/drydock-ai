import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentActions } from "@/components/agents/agent-actions";
import { AgentInstructionsEditor } from "@/components/agents/agent-instructions-editor";
import {
  agentStatusVariant,
  displayAgentStatus,
  formatHeartbeatAge,
} from "@/lib/agent-control-plane/display";
import { readInstructionsBundleForAgent } from "@/lib/agent-control-plane/instructions/service";
import { resolveRuntimeConfig } from "@/lib/agent-control-plane/runtime-config";
import type { InstructionsAdapterConfig } from "@/lib/agent-control-plane/instructions/service";

type PageProps = { params: Promise<{ id: string }> };

export default async function AgentDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      heartbeatRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
      _count: {
        select: { wakeupRequests: { where: { status: "queued" } } },
      },
    },
  });

  if (!agent) notFound();

  const bundle = await readInstructionsBundleForAgent(session.organizationId, agent);
  const lastRun = agent.heartbeatRuns[0];
  const isLead = agent.agentType === "SUPER_ORCHESTRATOR";
  const runtimeConfig = resolveRuntimeConfig(agent);

  let adapterConfig: InstructionsAdapterConfig | null = null;
  try {
    adapterConfig = JSON.parse(agent.adapterConfigJson) as InstructionsAdapterConfig;
  } catch {
    adapterConfig = null;
  }

  const heartbeat = runtimeConfig.heartbeat;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/agents" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to agents
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{agent.displayName}</h1>
            <p className="mt-1 text-slate-400">
              {agent.agentType.replace(/_/g, " ")}
              {isLead && " · Lead orchestrator"}
            </p>
          </div>
          <Badge variant={agentStatusVariant(agent.status)}>
            {displayAgentStatus(agent.status)}
          </Badge>
        </div>
      </div>

      <Card className={isLead ? "border-brand/30 bg-brand-muted/5" : undefined}>
        <CardHeader>
          <CardTitle className="text-base">Runtime</CardTitle>
          <CardDescription>Heartbeat controls and run history</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {agent.description && <p className="text-slate-400">{agent.description}</p>}
          <p>
            Confidence: {(agent.confidenceScore * 100).toFixed(0)}% · Mode: {agent.autonomyMode}
          </p>
          <p className="text-xs text-slate-500">
            Last heartbeat: {formatHeartbeatAge(agent.lastHeartbeatAt)}
            {agent._count.wakeupRequests > 0 && (
              <> · {agent._count.wakeupRequests} pending wakeup(s)</>
            )}
          </p>
          {lastRun && (
            <p className="text-xs text-slate-500">
              Last run: {lastRun.status}
              {lastRun.summary ? ` — ${lastRun.summary.slice(0, 120)}` : ""}
            </p>
          )}
          <dl className="grid gap-2 rounded-lg border border-white/8 bg-[#0B1020]/40 p-3 text-xs text-slate-400 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Adapter</dt>
              <dd className="text-slate-200">{agent.adapterType}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Skills</dt>
              <dd className="text-slate-200">
                {adapterConfig?.desiredSkills?.join(", ") ?? "aidos"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Timer heartbeat</dt>
              <dd className="text-slate-200">
                {heartbeat.enabled
                  ? `Every ${heartbeat.intervalSec}s`
                  : "Off (event-driven)"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Wake triggers</dt>
              <dd className="text-slate-200">
                {[
                  heartbeat.wakeOnEvent && "events",
                  heartbeat.wakeOnApproval && "approvals",
                  heartbeat.wakeOnDelegation && "delegation",
                ]
                  .filter(Boolean)
                  .join(" · ") || "none"}
              </dd>
            </div>
          </dl>
          <AgentActions agentId={agent.id} status={agent.status} />
        </CardContent>
      </Card>

      <AgentInstructionsEditor agentId={agent.id} initialBundle={bundle} />
    </div>
  );
}

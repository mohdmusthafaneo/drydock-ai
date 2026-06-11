import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { AgentRuntimePanel } from "@/components/agents/agent-runtime-panel";
import { AgentInstructionsEditor } from "@/components/agents/agent-instructions-editor";
import {
  agentStatusVariant,
  displayAgentStatus,
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
    select: {
      id: true,
      agentType: true,
      displayName: true,
      status: true,
      adapterType: true,
      adapterConfigJson: true,
      runtimeConfigJson: true,
    },
  });

  if (!agent) notFound();

  const bundle = await readInstructionsBundleForAgent(session.organizationId, agent);
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

      <AgentRuntimePanel
        agentId={agent.id}
        isLead={isLead}
        adapterType={agent.adapterType}
        skillsLabel={adapterConfig?.desiredSkills?.join(", ") ?? "aidos"}
        heartbeatLabel={
          heartbeat.enabled
            ? `Every ${heartbeat.intervalSec}s`
            : "Off (event-driven)"
        }
        wakeTriggersLabel={
          [
            heartbeat.wakeOnEvent && "events",
            heartbeat.wakeOnApproval && "approvals",
            heartbeat.wakeOnDelegation && "delegation",
          ]
            .filter(Boolean)
            .join(" · ") || "none"
        }
      />

      <AgentInstructionsEditor agentId={agent.id} initialBundle={bundle} />
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentActions } from "@/components/agents/agent-actions";
import {
  agentStatusVariant,
  displayAgentStatus,
  formatHeartbeatAge,
} from "@/lib/agent-control-plane/display";

export default async function AgentsManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const agentsWithRuns = await prisma.agentRegistry.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { agentType: "asc" },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <p className="mt-1 text-slate-400">
          Governed agent control plane — heartbeats, wakeups, and human approval gates.
        </p>
      </div>

      {agentsWithRuns.length === 0 ? (
        <Card className="border-dashed border-white/10">
          <CardContent className="py-10 text-center text-slate-500">
            Complete governance setup to initialize the agent registry.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agentsWithRuns.map((agent) => {
            const lastRun = agent.heartbeatRuns[0];
            const isLead = agent.agentType === "SUPER_ORCHESTRATOR";

            return (
              <Card
                key={agent.id}
                className={isLead ? "border-brand/30 bg-brand-muted/5" : undefined}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        <Link href={`/agents/${agent.id}`} className="hover:text-brand">
                          {agent.displayName}
                        </Link>
                      </CardTitle>
                      {isLead && (
                        <p className="mt-0.5 text-xs text-brand">Lead orchestrator</p>
                      )}
                    </div>
                    <Badge variant={agentStatusVariant(agent.status)}>
                      {displayAgentStatus(agent.status)}
                    </Badge>
                  </div>
                  <CardDescription>
                    {agent.agentType.replace(/_/g, " ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {agent.description && (
                    <p className="text-slate-400">{agent.description}</p>
                  )}
                  <p>
                    Confidence: {(agent.confidenceScore * 100).toFixed(0)}% · Mode:{" "}
                    {agent.autonomyMode}
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
                      {lastRun.summary ? ` — ${lastRun.summary.slice(0, 80)}` : ""}
                    </p>
                  )}
                  <AgentActions agentId={agent.id} status={agent.status} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Invoke queues a wakeup (async). Drain the queue with{" "}
        <code className="text-slate-500">npm run worker:agents</code> in dev or{" "}
        <code className="text-slate-500">POST /api/platform/agents/worker</code>{" "}
        (Bearer PLATFORM_WORKER_SECRET) every 30–60s in production.
      </p>
    </div>
  );
}

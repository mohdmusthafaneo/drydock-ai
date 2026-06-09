import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  displayAgentStatus,
  formatDuration,
  formatTokenUsage,
  formatWakeupSource,
  runStatusVariant,
} from "@/lib/agent-control-plane/display";

type PageProps = { params: Promise<{ id: string }> };

export default async function AgentRunsPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!agent) notFound();

  const runs = await prisma.agentHeartbeatRun.findMany({
    where: { agentId: id, organizationId: session.organizationId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/agents" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to agents
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{agent.displayName} — runs</h1>
        <p className="mt-1 text-slate-400">
          Heartbeat history · status {displayAgentStatus(agent.status)}
        </p>
      </div>

      {runs.length === 0 ? (
        <Card className="border-dashed border-white/10">
          <CardContent className="py-10 text-center text-slate-500">
            No heartbeat runs yet. Use Invoke on the agents page or wait for the worker timer.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Started</th>
                  <th className="pb-2 pr-4 font-medium">Duration</th>
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 pr-4 font-medium">Reason</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Mode</th>
                  <th className="pb-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const tokenUsage = (() => {
                    try {
                      return JSON.parse(run.tokenUsageJson) as {
                        inputTokens?: number;
                        outputTokens?: number;
                        mode?: string;
                      };
                    } catch {
                      return {};
                    }
                  })();

                  return (
                  <tr key={run.id} className="border-b border-white/5">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-300">
                      <Link
                        href={`/agents/${id}/runs/${run.id}`}
                        className="hover:text-brand"
                      >
                        {run.startedAt.toLocaleString()}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {formatDuration(run.startedAt, run.finishedAt)}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {formatWakeupSource(run.source)}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">{run.reason}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {formatTokenUsage(tokenUsage)}
                    </td>
                    <td className="py-2 max-w-xs truncate text-slate-400">
                      <Link
                        href={`/agents/${id}/runs/${run.id}`}
                        className="hover:text-slate-200"
                      >
                        {run.summary ?? run.error ?? "—"}
                      </Link>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

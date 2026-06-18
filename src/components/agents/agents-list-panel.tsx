"use client";

import Link from "next/link";
import { useAgentsQuery } from "@/lib/queries/agents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRefreshButton } from "@/components/ui/data-refresh-button";
import { QueryPanelError, QueryPanelLoading } from "@/components/ui/query-panel-state";
import { AgentActions } from "@/components/agents/agent-actions";
import {
  agentStatusVariant,
  displayAgentStatus,
  formatHeartbeatAge,
} from "@/lib/agent-control-plane/display";

export function AgentsListPanel() {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useAgentsQuery();

  if (isLoading) {
    return <QueryPanelLoading label="Loading agents…" />;
  }

  if (isError) {
    return (
      <QueryPanelError
        message={error instanceof Error ? error.message : "Failed to load agents"}
        onRetry={() => void refetch()}
      />
    );
  }

  const agents = data?.agents ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DataRefreshButton
          onRefresh={() => void refetch()}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
        />
      </div>

      {agents.length === 0 ? (
        <Card className="border-dashed border-dove">
          <CardContent className="py-10 text-center text-graphite">
            Complete governance setup to initialize the agent registry.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => {
            const isLead = agent.agentType === "SUPER_ORCHESTRATOR";
            const lastRun = agent.lastRun;

            return (
              <Card
                key={agent.id}
                className={isLead ? "border-chart-blue/30 bg-sky-wash/30" : undefined}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        <Link href={`/agents/${agent.id}`} className="hover:text-chart-blue">
                          {agent.displayName}
                        </Link>
                      </CardTitle>
                      {isLead && (
                        <p className="mt-0.5 text-xs text-rust">Lead orchestrator</p>
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
                    <p className="text-ash">{agent.description}</p>
                  )}
                  <p className="text-ink">
                    Confidence: {(agent.confidenceScore * 100).toFixed(0)}% · Mode:{" "}
                    {agent.autonomyMode}
                  </p>
                  <p className="text-xs text-graphite">
                    Last heartbeat: {formatHeartbeatAge(agent.lastHeartbeatAt)}
                    {agent.pendingWakeups > 0 && (
                      <> · {agent.pendingWakeups} pending wakeup(s)</>
                    )}
                  </p>
                  {lastRun && (
                    <p className="text-xs text-graphite">
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
    </div>
  );
}

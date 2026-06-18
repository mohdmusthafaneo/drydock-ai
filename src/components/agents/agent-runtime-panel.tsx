"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRefreshButton } from "@/components/ui/data-refresh-button";
import { QueryPanelError, QueryPanelLoading } from "@/components/ui/query-panel-state";
import { AgentActions } from "@/components/agents/agent-actions";
import { useAgentDetailQuery } from "@/lib/queries/agents";
import {
  agentStatusVariant,
  displayAgentStatus,
  formatHeartbeatAge,
} from "@/lib/agent-control-plane/display";

type AgentRuntimePanelProps = {
  agentId: string;
  isLead: boolean;
  adapterType: string;
  skillsLabel: string;
  heartbeatLabel: string;
  wakeTriggersLabel: string;
};

export function AgentRuntimePanel({
  agentId,
  isLead,
  adapterType,
  skillsLabel,
  heartbeatLabel,
  wakeTriggersLabel,
}: AgentRuntimePanelProps) {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useAgentDetailQuery(agentId);

  if (isLoading) {
    return <QueryPanelLoading label="Loading agent status…" />;
  }

  if (isError || !data) {
    return (
      <QueryPanelError
        message={error instanceof Error ? error.message : "Failed to load agent"}
        onRetry={() => void refetch()}
      />
    );
  }

  const { agent, recentRuns } = data;
  const lastRun = recentRuns[0];

  return (
    <Card className={isLead ? "border-chart-blue/30 bg-sky-wash/30" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Runtime</CardTitle>
            <CardDescription>Heartbeat controls and run history</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={agentStatusVariant(agent.status)}>
              {displayAgentStatus(agent.status)}
            </Badge>
            <DataRefreshButton
              onRefresh={() => void refetch()}
              isFetching={isFetching}
              dataUpdatedAt={dataUpdatedAt}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {agent.description && <p className="text-ash">{agent.description}</p>}
        <p className="text-ink">
          Confidence: {(agent.confidenceScore * 100).toFixed(0)}% · Mode: {agent.autonomyMode}
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
            {lastRun.summary ? ` — ${lastRun.summary.slice(0, 120)}` : ""}
          </p>
        )}
        <dl className="grid gap-2 rounded-2xl border border-border-subtle bg-fog p-3 text-xs text-ash sm:grid-cols-2">
          <div>
            <dt className="text-graphite">Adapter</dt>
            <dd className="text-ink">{adapterType}</dd>
          </div>
          <div>
            <dt className="text-graphite">Skills</dt>
            <dd className="text-ink">{skillsLabel}</dd>
          </div>
          <div>
            <dt className="text-graphite">Timer heartbeat</dt>
            <dd className="text-ink">{heartbeatLabel}</dd>
          </div>
          <div>
            <dt className="text-graphite">Wake triggers</dt>
            <dd className="text-ink">{wakeTriggersLabel}</dd>
          </div>
        </dl>
        <AgentActions agentId={agentId} status={agent.status} />
      </CardContent>
    </Card>
  );
}

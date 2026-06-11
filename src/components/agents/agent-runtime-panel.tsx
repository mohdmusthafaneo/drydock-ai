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
    <Card className={isLead ? "border-brand/30 bg-brand-muted/5" : undefined}>
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
        {agent.description && <p className="text-slate-400">{agent.description}</p>}
        <p>
          Confidence: {(agent.confidenceScore * 100).toFixed(0)}% · Mode: {agent.autonomyMode}
        </p>
        <p className="text-xs text-slate-500">
          Last heartbeat: {formatHeartbeatAge(agent.lastHeartbeatAt)}
          {agent.pendingWakeups > 0 && (
            <> · {agent.pendingWakeups} pending wakeup(s)</>
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
            <dd className="text-slate-200">{adapterType}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Skills</dt>
            <dd className="text-slate-200">{skillsLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Timer heartbeat</dt>
            <dd className="text-slate-200">{heartbeatLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Wake triggers</dt>
            <dd className="text-slate-200">{wakeTriggersLabel}</dd>
          </div>
        </dl>
        <AgentActions agentId={agentId} status={agent.status} />
      </CardContent>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useAgentRunsQuery } from "@/lib/queries/runs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRefreshButton } from "@/components/ui/data-refresh-button";
import { QueryPanelError, QueryPanelLoading } from "@/components/ui/query-panel-state";
import {
  formatDuration,
  formatTokenUsage,
  formatWakeupSource,
  runStatusVariant,
} from "@/lib/agent-control-plane/display";

type AgentRunsTableProps = {
  agentId: string;
  agentDisplayName: string;
  agentStatus: string;
};

export function AgentRunsTable({
  agentId,
  agentDisplayName,
  agentStatus,
}: AgentRunsTableProps) {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useAgentRunsQuery(agentId, 50);

  if (isLoading) {
    return <QueryPanelLoading label="Loading run history…" />;
  }

  if (isError) {
    return (
      <QueryPanelError
        message={error instanceof Error ? error.message : "Failed to load runs"}
        onRetry={() => void refetch()}
      />
    );
  }

  const runs = data?.runs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {agentDisplayName} · status {agentStatus}
        </p>
        <DataRefreshButton
          onRefresh={() => void refetch()}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
        />
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
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-white/5">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-300">
                      <Link
                        href={`/agents/${agentId}/runs/${run.id}`}
                        className="hover:text-brand"
                      >
                        {new Date(run.startedAt).toLocaleString()}
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
                      {formatTokenUsage(run.tokenUsage)}
                    </td>
                    <td className="py-2 max-w-xs truncate text-slate-400">
                      <Link
                        href={`/agents/${agentId}/runs/${run.id}`}
                        className="hover:text-slate-200"
                      >
                        {run.summary ?? run.error ?? "—"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

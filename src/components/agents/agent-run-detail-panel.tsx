"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { DataRefreshButton } from "@/components/ui/data-refresh-button";
import { QueryPanelError, QueryPanelLoading } from "@/components/ui/query-panel-state";
import { useRunDetailQuery } from "@/lib/queries/runs";
import {
  formatDuration,
  formatTokenUsage,
  formatWakeupSource,
  runStatusVariant,
} from "@/lib/agent-control-plane/display";
import { TERMINAL_RUN_STATUSES } from "@/lib/queries/types";

type AgentRunDetailPanelProps = {
  agentId: string;
  runId: string;
};

export function AgentRunDetailPanel({ agentId, runId }: AgentRunDetailPanelProps) {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useRunDetailQuery(agentId, runId);

  if (isLoading) {
    return <QueryPanelLoading label="Loading run detail…" />;
  }

  if (isError || !data) {
    return (
      <QueryPanelError
        message={error instanceof Error ? error.message : "Failed to load run"}
        onRetry={() => void refetch()}
      />
    );
  }

  const { run, agent } = data;
  const tokenUsage = run.tokenUsage;
  const isLive = !TERMINAL_RUN_STATUSES.has(run.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {agent.displayName} — run detail
          </h1>
          <p className="mt-1 text-slate-400">
            {new Date(run.startedAt).toLocaleString()} ·{" "}
            {formatWakeupSource(run.source)} · {run.reason}
          </p>
          {isLive && (
            <p className="mt-1 text-xs text-brand">Live — polling for updates</p>
          )}
        </div>
        <DataRefreshButton
          onRefresh={() => void refetch()}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
              <span className="text-slate-400">
                {formatDuration(run.startedAt, run.finishedAt)}
              </span>
            </div>
            {run.exitCode != null && (
              <p className="text-slate-400">Exit code: {run.exitCode}</p>
            )}
            <p className="text-slate-400">Tokens: {formatTokenUsage(tokenUsage)}</p>
            {(tokenUsage.mode === "anthropic" || tokenUsage.mode === "openai") && (
              <p className="text-xs text-slate-500">
                In: {tokenUsage.inputTokens ?? 0} · Out: {tokenUsage.outputTokens ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            {run.summary ? (
              <MarkdownContent content={run.summary} normalizeInlineLists />
            ) : run.error ? (
              <MarkdownContent content={run.error} normalizeInlineLists />
            ) : (
              "No summary recorded."
            )}
          </CardContent>
        </Card>
      </div>

      {run.error && (
        <Card className="border-red-500/20">
          <CardHeader>
            <CardTitle className="text-base text-red-300">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-red-200/80">{run.error}</CardContent>
        </Card>
      )}

      {Object.keys(run.contextSnapshot).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Context snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-black/30 p-3 text-xs text-slate-400">
              {JSON.stringify(run.contextSnapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {run.logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.logs.map((entry, i) => (
              <div
                key={`${entry.at}-${i}`}
                className="rounded-md border border-white/5 bg-black/20 px-3 py-2 text-xs"
              >
                <span className="text-slate-500">{entry.at}</span>{" "}
                <span
                  className={
                    entry.level === "error" ? "text-red-300" : "text-slate-400"
                  }
                >
                  [{entry.level}]
                </span>{" "}
                <span className="text-slate-300">{entry.message ?? "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

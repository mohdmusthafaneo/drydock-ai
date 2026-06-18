"use client";

import Link from "next/link";
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
  const threadId =
    typeof run.contextSnapshot.threadId === "string"
      ? run.contextSnapshot.threadId
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink sm:text-[32px]">
            {agent.displayName} — run detail
          </h1>
          <p className="mt-1 text-ash">
            {new Date(run.startedAt).toLocaleString()} ·{" "}
            {formatWakeupSource(run.source)} · {run.reason}
          </p>
          {threadId && (
            <p className="mt-1">
              <Link
                href={`/agent-threads/${threadId}`}
                className="text-sm font-medium text-ink underline-offset-4 hover:underline"
              >
                View agent thread →
              </Link>
            </p>
          )}
          {isLive && (
            <p className="mt-1 text-xs text-chart-blue">Live — polling for updates</p>
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
              <span className="text-ash">
                {formatDuration(run.startedAt, run.finishedAt)}
              </span>
            </div>
            {run.exitCode != null && (
              <p className="text-ash">Exit code: {run.exitCode}</p>
            )}
            <p className="text-ash">Tokens: {formatTokenUsage(tokenUsage)}</p>
            {(tokenUsage.mode === "anthropic" ||
              tokenUsage.mode === "openai" ||
              tokenUsage.mode === "mastra") && (
              <p className="text-xs text-graphite">
                In: {tokenUsage.inputTokens ?? 0} · Out: {tokenUsage.outputTokens ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ash">
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
        <Card className="border-error/20 bg-error-muted">
          <CardHeader>
            <CardTitle className="text-base text-error">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-error">{run.error}</CardContent>
        </Card>
      )}

      {Object.keys(run.contextSnapshot).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Context snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-2xl bg-fog p-3 text-xs text-ash">
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
                className="rounded-2xl border border-border-subtle bg-fog px-3 py-2 text-xs"
              >
                <span className="text-graphite">{entry.at}</span>{" "}
                <span
                  className={
                    entry.level === "error" ? "text-error" : "text-ash"
                  }
                >
                  [{entry.level}]
                </span>{" "}
                <span className="text-ink">{entry.message ?? "—"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(run.mastraRunId || run.mastraTraceId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mastra trace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-ash">
            {run.mastraTraceId && (
              <p>
                <span className="text-graphite">Trace ID:</span>{" "}
                <code className="rounded bg-fog px-1.5 py-0.5 text-xs text-ink">
                  {run.mastraTraceId}
                </code>
              </p>
            )}
            {run.mastraRunId && (
              <p>
                <span className="text-graphite">Run ID:</span>{" "}
                <code className="rounded bg-fog px-1.5 py-0.5 text-xs text-ink">
                  {run.mastraRunId}
                </code>
              </p>
            )}
            {process.env.NODE_ENV === "development" && run.mastraTraceId && (
              <p className="text-xs text-graphite">
                Open Mastra Studio locally to inspect this trace (
                <code className="text-ash">npm run mastra:studio</code>).
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

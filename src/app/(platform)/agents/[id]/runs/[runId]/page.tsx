import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatDuration,
  formatTokenUsage,
  formatWakeupSource,
  runStatusVariant,
} from "@/lib/agent-control-plane/display";

type PageProps = { params: Promise<{ id: string; runId: string }> };

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default async function AgentRunDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id, runId } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!agent) notFound();

  const run = await prisma.agentHeartbeatRun.findFirst({
    where: {
      id: runId,
      agentId: id,
      organizationId: session.organizationId,
    },
  });

  if (!run) notFound();

  const tokenUsage = parseJson(run.tokenUsageJson, {
    inputTokens: 0,
    outputTokens: 0,
    mode: "rule-engine" as string | undefined,
  });
  const logs = parseJson<Array<{ at: string; level: string; message?: string }>>(
    run.logsJson,
    [],
  );
  const contextSnapshot = parseJson<Record<string, unknown>>(
    run.contextSnapshotJson,
    {},
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/agents/${id}/runs`}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Back to run history
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {agent.displayName} — run detail
        </h1>
        <p className="mt-1 text-slate-400">
          {run.startedAt.toLocaleString()} ·{" "}
          {formatWakeupSource(run.source)} · {run.reason}
        </p>
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
            <p className="text-slate-400">
              Tokens: {formatTokenUsage(tokenUsage)}
            </p>
            {(tokenUsage.mode === "anthropic" || tokenUsage.mode === "openai") && (
              <p className="text-xs text-slate-500">
                In: {tokenUsage.inputTokens ?? 0} · Out:{" "}
                {tokenUsage.outputTokens ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            {run.summary ?? run.error ?? "No summary recorded."}
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

      {Object.keys(contextSnapshot).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Context snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-black/30 p-3 text-xs text-slate-400">
              {JSON.stringify(contextSnapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {logs.map((entry, i) => (
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

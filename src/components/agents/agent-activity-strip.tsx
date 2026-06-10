import Link from "next/link";
import { Bot, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRunStatusLabel } from "@/lib/agent-control-plane/display";

export type AgentActivityItem = {
  id: string;
  agentId: string;
  agentName: string;
  status: string;
  source: string;
  reason: string | null;
  summary: string | null;
  finishedAt: Date | null;
  startedAt: Date;
};

type AgentActivityStripProps = {
  agents: Array<{ id: string; displayName: string; status: string }>;
  recentRuns: AgentActivityItem[];
};

function statusIcon(status: string) {
  if (status === "succeeded") return CheckCircle2;
  if (status === "timed_out" || status === "failed") return XCircle;
  if (status === "running") return Clock;
  return Bot;
}

function statusColor(status: string) {
  if (status === "succeeded") return "text-success";
  if (status === "timed_out" || status === "failed") return "text-destructive";
  if (status === "running") return "text-brand";
  return "text-muted";
}

export function AgentActivityStrip({ agents, recentRuns }: AgentActivityStripProps) {
  const runnableAgents = agents.filter(
    (a) => !["TERMINATED", "PENDING_APPROVAL"].includes(a.status),
  );
  const runningCount = agents.filter((a) => a.status === "RUNNING").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-brand" />
            Agent activity
          </CardTitle>
          <CardDescription>
            {runnableAgents.length} agent{runnableAgents.length === 1 ? "" : "s"}
            {runningCount > 0 ? ` · ${runningCount} running` : ""}
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href="/agents">All agents</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-muted">
            No heartbeat runs yet. Register a release or invoke the Super Agent to start the
            operational loop.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recentRuns.map((run) => {
              const Icon = statusIcon(run.status);
              return (
                <li key={run.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", statusColor(run.status))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/agents/${run.agentId}`}
                        className="font-medium text-primary hover:text-accent"
                      >
                        {run.agentName}
                      </Link>
                      <Badge variant="muted" className="text-xs">
                        {run.source}
                      </Badge>
                      <span className={cn("text-xs font-medium", statusColor(run.status))}>
                        {formatRunStatusLabel(
                          run.status as "running" | "succeeded" | "failed" | "timed_out" | "cancelled",
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-secondary">
                      {run.summary ?? run.reason ?? "Heartbeat run"}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(run.finishedAt ?? run.startedAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

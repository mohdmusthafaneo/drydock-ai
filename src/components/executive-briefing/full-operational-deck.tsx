import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Gauge,
  GitBranch,
  Radio,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AgentActivityStrip,
  type AgentActivityItem,
} from "@/components/agents/agent-activity-strip";
import { formatTokenRollup } from "@/lib/agent-control-plane/token-rollup";
import type { getOrganizationContext } from "@/lib/org-data";

type Props = {
  ctx: Awaited<ReturnType<typeof getOrganizationContext>>;
  orgName: string;
};

export function FullOperationalDeck({ ctx, orgName }: Props) {
  const kpis = [
    { label: "Release readiness", value: `${ctx.stats.releaseReadiness}%`, icon: Gauge },
    { label: "Telemetry events", value: String(ctx.stats.telemetryEventCount), icon: Radio },
    {
      label: "Integrations healthy",
      value: `${ctx.stats.integrationsHealthy}/${ctx.stats.connectedTools}`,
      icon: Activity,
    },
    { label: "Pending approvals", value: String(ctx.stats.pendingApprovals), icon: CheckCircle2 },
  ];

  const recentEvents = ctx.events.slice(0, 6);

  const phase2Links = [
    {
      href: "/observability",
      title: "Observability",
      description: "Telemetry, latency, and error signals",
      stat: `${ctx.stats.metricCount} metrics`,
    },
    {
      href: "/devops",
      title: "DevOps intelligence",
      description: "Deployments, health, and rollbacks",
      stat:
        ctx.stats.degradedDeployments > 0
          ? `${ctx.stats.degradedDeployments} degraded`
          : "All healthy",
    },
    {
      href: "/incidents",
      title: "Incidents",
      description: "Correlated operational events",
      stat: `${ctx.stats.openIncidents} open`,
    },
  ];

  const latestRelease = ctx.releases[0];
  const recentAudit = ctx.auditLogs.slice(0, 5);

  const agentActivity: AgentActivityItem[] = ctx.agentRuns.map((run) => ({
    id: run.id,
    agentId: run.agentId,
    agentName: run.agent.displayName,
    status: run.status,
    source: run.source,
    reason: run.reason,
    summary: run.summary,
    finishedAt: run.finishedAt,
    startedAt: run.startedAt,
  }));

  return (
    <section id="full-deck" className="scroll-mt-20 space-y-8 border-t border-border py-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight lg:text-xl">Full operational view</h2>
          <p className="mt-1 text-sm text-secondary">
            For engineering leads who want the complete picture · {orgName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href="/releases/new">+ Register release</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/workflow">Workflow center</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="min-w-0">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription>{kpi.label}</CardDescription>
                <Icon className="h-4 w-4 shrink-0 text-muted" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-12">
        <Card className="border-accent/20 lg:col-span-1 2xl:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-enterprise" />
              Core governance workflow
            </CardTitle>
            <CardDescription>Detect → assess → approve → deploy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-secondary">
            <ol className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
              <li>1. Register release event</li>
              <li>2. Collect telemetry & QA signals</li>
              <li>3. Governance risk + readiness scores</li>
              <li>4. Human approval in Approval Center</li>
              <li>5. Controlled deployment execution</li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild size="sm">
                <Link href="/workflow">Open workflow center</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/releases">All releases ({ctx.stats.activeReleases} active)</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="2xl:col-span-4">
          <CardHeader>
            <CardTitle>Approval center</CardTitle>
            <CardDescription>Human-governed AI recommendations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ctx.stats.pendingApprovals > 0 ? (
              <Button asChild className="w-full sm:w-auto">
                <Link href="/approvals">
                  {ctx.stats.pendingApprovals} pending — review now
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted">No pending release approvals.</p>
            )}
            {ctx.stats.pendingRecommendations > 0 && (
              <p className="text-sm text-secondary">
                {ctx.stats.pendingRecommendations} AI recommendations awaiting review.{" "}
                <Link href="/recommendations" className="text-brand hover:underline">
                  View recommendations
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="2xl:col-span-3">
          <CardHeader>
            <CardTitle>Platform health</CardTitle>
            <CardDescription>At-a-glance signals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/50 px-3 py-2">
              <span className="text-secondary">Connected integrations</span>
              <span className="font-medium">{ctx.stats.connectedTools}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/50 px-3 py-2">
              <span className="text-secondary">Active agents</span>
              <span className="font-medium">{ctx.stats.activeAgents}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/50 px-3 py-2">
              <span className="text-secondary">Agent tokens (30d)</span>
              <span className="font-medium">
                {formatTokenRollup({
                  runCount: ctx.stats.agentHeartbeatRuns30d,
                  succeededRuns: 0,
                  inputTokens: ctx.stats.agentTokenInput,
                  outputTokens: ctx.stats.agentTokenOutput,
                  periodDays: 30,
                })}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/50 px-3 py-2">
              <span className="text-secondary">P95 latency</span>
              <span className="font-medium">
                {ctx.stats.p95Latency != null ? `${ctx.stats.p95Latency}ms` : "—"}
              </span>
            </div>
            {ctx.stats.rollbackPending > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning-muted px-3 py-2">
                <span className="text-secondary">Rollback recommended</span>
                <span className="font-medium text-warning">{ctx.stats.rollbackPending}</span>
              </div>
            )}
            <Button asChild size="sm" variant="secondary" className="w-full">
              <Link href="/integrations">
                Manage integrations
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <AgentActivityStrip
        agents={ctx.agents.map((a) => ({
          id: a.id,
          displayName: a.displayName,
          status: a.status,
        }))}
        recentRuns={agentActivity}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Deep observability</h3>
            <p className="text-sm text-secondary">Phase 1 shell · expanded in Phase 2</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {phase2Links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-elevated"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-primary group-hover:text-accent">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-secondary">{item.description}</p>
                </div>
                <Radio className="h-4 w-4 shrink-0 text-muted group-hover:text-accent" />
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">
                {item.stat}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {latestRelease && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-muted" />
                Latest release
              </CardTitle>
              <CardDescription>{latestRelease.name}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Badge variant="ai">{latestRelease.status.replace(/_/g, " ")}</Badge>
              {latestRelease.readinessScore != null && (
                <span className="text-sm text-secondary">
                  QA readiness {Math.round(latestRelease.readinessScore)}%
                </span>
              )}
              {latestRelease.governanceRiskScore != null && (
                <span className="text-sm text-secondary">
                  Risk {Math.round(latestRelease.governanceRiskScore)}%
                </span>
              )}
              <Button asChild size="sm" variant="secondary" className="ml-auto">
                <Link href={`/releases/${latestRelease.id}`}>Open release</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className={cn(!latestRelease && "xl:col-span-2")}>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Operational events & audit trail</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 && recentAudit.length === 0 ? (
              <p className="text-sm text-muted">No recent activity yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentEvents.map((ev) => (
                  <li key={ev.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium text-primary">{ev.title}</p>
                    {ev.description && (
                      <p className="mt-0.5 text-sm text-secondary">{ev.description}</p>
                    )}
                  </li>
                ))}
                {recentAudit.map((log) => (
                  <li key={log.id} className="py-3">
                    <p className="text-sm">
                      <span className="font-medium text-accent">{log.action}</span>
                      <span className="text-secondary"> · {log.entityType}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {log.user?.name ?? "System"} ·{" "}
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild size="sm" variant="secondary" className="mt-4">
              <Link href="/audit">View audit logs</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

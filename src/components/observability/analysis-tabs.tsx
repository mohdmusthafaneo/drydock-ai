"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import { OperationalSignalsPanel } from "@/components/observability/operational-signals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TabId = "overview" | "services" | "deploys" | "alerts" | "signals" | "slo";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "services", label: "Services" },
  { id: "deploys", label: "Deploys" },
  { id: "alerts", label: "Alerts" },
  { id: "signals", label: "Signals" },
  { id: "slo", label: "SLO" },
];

export function AnalysisTabs({ snapshot }: { snapshot: ObservabilityAnalysisSnapshot }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [expandedService, setExpandedService] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle className="text-base">Drill-down</CardTitle>
          <CardDescription>Services, deploys, alerts, signals, and SLO detail</CardDescription>
        </div>

        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-sky-wash text-chart-blue"
                  : "text-muted hover:bg-hover hover:text-primary",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {tab === "overview" && <OverviewTab snapshot={snapshot} />}
        {tab === "services" && (
          <ServicesTab
            snapshot={snapshot}
            expandedService={expandedService}
            onToggleExpand={(id) =>
              setExpandedService((prev) => (prev === id ? null : id))
            }
          />
        )}
        {tab === "deploys" && <DeploysTab snapshot={snapshot} />}
        {tab === "alerts" && <AlertsTab snapshot={snapshot} />}
        {tab === "signals" && <OperationalSignalsPanel signals={snapshot.signals} />}
        {tab === "slo" && <SloTab snapshot={snapshot} />}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ snapshot }: { snapshot: ObservabilityAnalysisSnapshot }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Health score" value={String(snapshot.kpis.healthScore)} />
        <SummaryStat label="Error rate" value={`${snapshot.kpis.errorRate}%`} />
        <SummaryStat label="P95 latency" value={`${snapshot.kpis.p95LatencyMs}ms`} />
        <SummaryStat label="Open alerts" value={String(snapshot.kpis.openAlerts)} />
      </div>
      {snapshot.gaps.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Priority gaps</p>
          <ul className="space-y-2">
            {snapshot.gaps.map((gap, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm"
              >
                <span className="text-secondary">
                  <span className="font-medium text-primary">{gap.area}: </span>
                  {gap.gap}
                </span>
                <Badge
                  variant={
                    gap.priority === "high"
                      ? "error"
                      : gap.priority === "medium"
                        ? "warning"
                        : "default"
                  }
                >
                  {gap.priority}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/integrations" className="text-brand hover:underline">
          Integrations →
        </Link>
        <Link href="/devops" className="text-brand hover:underline">
          DevOps intelligence →
        </Link>
        <Link href="/incidents" className="text-brand hover:underline">
          Incidents →
        </Link>
        <Link href="/recommendations" className="text-brand hover:underline">
          Recommendations →
        </Link>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-elevated/30 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ServicesTab({
  snapshot,
  expandedService,
  onToggleExpand,
}: {
  snapshot: ObservabilityAnalysisSnapshot;
  expandedService: string | null;
  onToggleExpand: (id: string) => void;
}) {
  if (snapshot.byService.length === 0) {
    return <p className="py-4 text-sm text-muted">No services in scope for the current filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="pb-2 w-8" />
            <th className="pb-2 font-medium">Service</th>
            <th className="pb-2 font-medium">Environment</th>
            <th className="pb-2 font-medium">Health</th>
            <th className="pb-2 font-medium">Error rate</th>
            <th className="pb-2 font-medium">P95</th>
            <th className="pb-2 font-medium">CPU</th>
            <th className="pb-2 font-medium">Memory</th>
            <th className="pb-2 font-medium">Alerts</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.byService.map((s) => {
            const expanded = expandedService === s.id;
            return (
              <Fragment key={s.id}>
                <tr
                  className="cursor-pointer border-b border-border-subtle hover:bg-hover"
                  onClick={() => onToggleExpand(s.id)}
                >
                  <td className="py-2">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </td>
                  <td className="py-2 font-medium text-primary">{s.label}</td>
                  <td className="py-2 text-secondary">{s.environment}</td>
                  <td className="py-2 tabular-nums">{s.healthScore}</td>
                  <td className="py-2 tabular-nums">{s.errorRate}%</td>
                  <td className="py-2 tabular-nums">{s.p95LatencyMs}ms</td>
                  <td className="py-2 tabular-nums">{s.cpuUtilizationPct}%</td>
                  <td className="py-2 tabular-nums">{s.memoryUtilizationPct}%</td>
                  <td className="py-2 tabular-nums">{s.openAlerts}</td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border-subtle bg-elevated/20">
                    <td colSpan={9} className="px-4 py-3 text-xs text-secondary">
                      Resource pressure: CPU {s.cpuUtilizationPct}%, memory{" "}
                      {s.memoryUtilizationPct}%.{" "}
                      {s.healthScore < 60 && (
                        <Badge variant="error" className="ml-1">
                          Critical health
                        </Badge>
                      )}
                      {s.healthScore >= 60 && s.healthScore < 80 && (
                        <Badge variant="warning" className="ml-1">
                          Degraded
                        </Badge>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeploysTab({ snapshot }: { snapshot: ObservabilityAnalysisSnapshot }) {
  if (snapshot.deploys.length === 0) {
    return <p className="py-4 text-sm text-muted">No deployment events in scope.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="pb-2 font-medium">Release</th>
            <th className="pb-2 font-medium">Environment</th>
            <th className="pb-2 font-medium">Deployed at</th>
            <th className="pb-2 font-medium">Health</th>
            <th className="pb-2 font-medium">Error Δ</th>
            <th className="pb-2 font-medium">P95 Δ</th>
            <th className="pb-2 font-medium">Rollback</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.deploys.map((d) => (
            <tr key={d.deploymentEventId} className="border-b border-border-subtle last:border-0">
              <td className="py-2 font-medium text-primary">{d.releaseName}</td>
              <td className="py-2 text-secondary">{d.environment}</td>
              <td className="py-2 text-xs text-muted">
                {new Date(d.deployedAt).toLocaleString()}
              </td>
              <td className="py-2">
                <Badge
                  variant={
                    d.health === "HEALTHY"
                      ? "success"
                      : d.health === "DEGRADED"
                        ? "warning"
                        : "error"
                  }
                >
                  {d.health}
                </Badge>
              </td>
              <td className="py-2 tabular-nums text-secondary">
                {d.errorRateDelta > 0 ? "+" : ""}
                {d.errorRateDelta}%
              </td>
              <td className="py-2 tabular-nums text-secondary">
                {d.p95LatencyDelta > 0 ? "+" : ""}
                {d.p95LatencyDelta}ms
              </td>
              <td className="py-2">
                {d.rollbackRecommended ? (
                  <Badge variant="warning">Recommended</Badge>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertsTab({ snapshot }: { snapshot: ObservabilityAnalysisSnapshot }) {
  if (snapshot.alerts.length === 0) {
    return <p className="py-4 text-sm text-muted">No alerts in scope.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="pb-2 font-medium">Alert</th>
            <th className="pb-2 font-medium">Severity</th>
            <th className="pb-2 font-medium">Service</th>
            <th className="pb-2 font-medium">State</th>
            <th className="pb-2 font-medium">Since</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.alerts.map((a, i) => (
            <tr key={`${a.alertname}-${i}`} className="border-b border-border-subtle last:border-0">
              <td className="py-2 font-medium text-primary">{a.alertname}</td>
              <td className="py-2">
                <Badge
                  variant={
                    a.severity === "critical"
                      ? "error"
                      : a.severity === "warning"
                        ? "warning"
                        : "default"
                  }
                >
                  {a.severity}
                </Badge>
              </td>
              <td className="py-2 text-secondary">{a.service}</td>
              <td className="py-2">
                <Badge variant={a.state === "firing" ? "warning" : "muted"}>{a.state}</Badge>
              </td>
              <td className="py-2 text-xs text-muted">
                {new Date(a.startsAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SloTab({ snapshot }: { snapshot: ObservabilityAnalysisSnapshot }) {
  if (snapshot.slos.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted">No SLO templates configured for scoped services.</p>
        <Link href="/integrations" className="mt-2 inline-block text-sm text-brand hover:underline">
          Configure SLO templates on Integrations →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="pb-2 font-medium">SLO</th>
            <th className="pb-2 font-medium">Target</th>
            <th className="pb-2 font-medium">Current</th>
            <th className="pb-2 font-medium">Budget remaining</th>
            <th className="pb-2 font-medium">Burn (1h)</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.slos.map((s) => (
            <tr key={s.name} className="border-b border-border-subtle last:border-0">
              <td className="py-2 font-medium text-primary">{s.name}</td>
              <td className="py-2 tabular-nums">{s.targetPct}%</td>
              <td className="py-2 tabular-nums">{s.currentPct}%</td>
              <td className="py-2 tabular-nums">
                <span className={s.budgetRemainingPct < 50 ? "text-warning" : ""}>
                  {s.budgetRemainingPct}%
                </span>
              </td>
              <td className="py-2 tabular-nums text-secondary">{s.burnRate1h ?? "—"}×</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

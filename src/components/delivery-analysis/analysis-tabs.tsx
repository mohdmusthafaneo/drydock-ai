"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import { DeliverySignalsPanel } from "@/components/delivery-analysis/delivery-signals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TabId = "overview" | "versions" | "sprints" | "signals" | "projects";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "versions", label: "Versions" },
  { id: "sprints", label: "Sprints" },
  { id: "signals", label: "Signals" },
  { id: "projects", label: "Projects detail" },
];

export function AnalysisTabs({ snapshot }: { snapshot: DeliveryAnalysisSnapshot }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle className="text-base">Drill-down</CardTitle>
          <CardDescription>Versions, sprints, signals, and per-project detail</CardDescription>
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
                  ? "bg-enterprise-muted text-enterprise"
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
        {tab === "versions" && <VersionsTab snapshot={snapshot} />}
        {tab === "sprints" && <SprintsTab snapshot={snapshot} />}
        {tab === "signals" && (
          <DeliverySignalsPanel signals={snapshot.signals} siteUrl={snapshot.siteUrl} />
        )}
        {tab === "projects" && (
          <ProjectsTab
            snapshot={snapshot}
            expandedProject={expandedProject}
            onToggleExpand={(key) =>
              setExpandedProject((prev) => (prev === key ? null : key))
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ snapshot }: { snapshot: DeliveryAnalysisSnapshot }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Health score" value={String(snapshot.kpis.healthScore)} />
        <SummaryStat label="Open work" value={snapshot.kpis.openWork.toLocaleString()} />
        <SummaryStat label="Blocked" value={snapshot.kpis.blocked.toLocaleString()} />
        <SummaryStat label="Overdue" value={snapshot.kpis.overdue.toLocaleString()} />
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
                <span className="text-secondary">{gap.gap}</span>
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
        <Link href="/workflow" className="text-brand hover:underline">
          Workflow center →
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

function VersionsTab({ snapshot }: { snapshot: DeliveryAnalysisSnapshot }) {
  if (snapshot.versions.length === 0) {
    return <p className="py-4 text-sm text-muted">No fix versions in scope.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="pb-2 font-medium">Project</th>
            <th className="pb-2 font-medium">Version</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Target date</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.versions.map((v) => (
            <tr key={`${v.projectKey}-${v.id}`} className="border-b border-border-subtle last:border-0">
              <td className="py-2 text-secondary">
                {v.projectKey}
                <span className="ml-1 text-muted">· {v.projectName}</span>
              </td>
              <td className="py-2 font-medium text-primary">{v.name}</td>
              <td className="py-2">
                {v.released ? (
                  <Badge variant="default">Released</Badge>
                ) : v.overdue ? (
                  <Badge variant="warning">Overdue</Badge>
                ) : (
                  <Badge variant="muted">Open</Badge>
                )}
              </td>
              <td className="py-2 tabular-nums text-secondary">{v.releaseDate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SprintsTab({ snapshot }: { snapshot: DeliveryAnalysisSnapshot }) {
  if (snapshot.sprints.length === 0) {
    return (
      <p className="py-4 text-sm text-muted">
        No active scrum sprints. Boards or sprint read scope may be unavailable.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="pb-2 font-medium">Project</th>
            <th className="pb-2 font-medium">Sprint</th>
            <th className="pb-2 font-medium">State</th>
            <th className="pb-2 font-medium">Window</th>
            <th className="pb-2 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.sprints.map((s) => (
            <tr
              key={`${s.projectKey}-${s.name}`}
              className="border-b border-border-subtle last:border-0"
            >
              <td className="py-2 text-secondary">{s.projectKey}</td>
              <td className="py-2 font-medium text-primary">{s.name}</td>
              <td className="py-2 capitalize text-secondary">{s.state}</td>
              <td className="py-2 text-xs text-muted">
                {s.startDate ?? "?"} → {s.endDate ?? "?"}
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-metric-track">
                    <div
                      className="h-full rounded-full bg-enterprise"
                      style={{ width: `${Math.min(100, s.pct)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs">
                    {s.done}/{s.committed} ({s.pct}%)
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectsTab({
  snapshot,
  expandedProject,
  onToggleExpand,
}: {
  snapshot: DeliveryAnalysisSnapshot;
  expandedProject: string | null;
  onToggleExpand: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="pb-2 w-8" />
            <th className="pb-2 font-medium">Project</th>
            <th className="pb-2 font-medium">Health</th>
            <th className="pb-2 font-medium">Open</th>
            <th className="pb-2 font-medium">Blocked</th>
            <th className="pb-2 font-medium">Overdue</th>
            <th className="pb-2 font-medium">Bugs</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.byProject.map((p) => {
            const expanded = expandedProject === p.key;
            const projectVersions = snapshot.versions.filter((v) => v.projectKey === p.key);
            const projectSprint = snapshot.sprints.find((s) => s.projectKey === p.key);
            return (
              <Fragment key={p.key}>
                <tr
                  className="cursor-pointer border-b border-border-subtle hover:bg-hover"
                  onClick={() => onToggleExpand(p.key)}
                >
                  <td className="py-2">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </td>
                  <td className="py-2 font-medium text-primary">
                    {p.key} · {p.name}
                  </td>
                  <td className="py-2 tabular-nums">{p.healthScore}</td>
                  <td className="py-2 tabular-nums">{p.openIssues}</td>
                  <td className="py-2 tabular-nums">{p.blockedCount}</td>
                  <td className="py-2 tabular-nums">{p.overdueCount}</td>
                  <td className="py-2 tabular-nums">{p.bugsOpen}</td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border-subtle bg-elevated/20">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {projectSprint && (
                          <div>
                            <p className="text-xs font-medium text-muted">Active sprint</p>
                            <p className="text-sm text-primary">{projectSprint.name}</p>
                            <p className="text-xs text-secondary">
                              {projectSprint.done}/{projectSprint.committed} complete (
                              {projectSprint.pct}%)
                            </p>
                          </div>
                        )}
                        {projectVersions.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted">Fix versions</p>
                            <ul className="mt-1 space-y-1">
                              {projectVersions.map((v) => (
                                <li key={v.id} className="text-xs text-secondary">
                                  {v.name}
                                  {v.overdue && !v.released && (
                                    <Badge variant="warning" className="ml-2 text-[10px]">
                                      Overdue
                                    </Badge>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {snapshot.siteUrl && (
                        <a
                          href={`${snapshot.siteUrl}/browse/${p.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                        >
                          Open {p.key} in Jira
                          <ExternalLink className="h-3 w-3" />
                        </a>
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

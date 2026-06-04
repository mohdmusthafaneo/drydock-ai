import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function deliveryAnalysisToCsv(snapshot: DeliveryAnalysisSnapshot): string {
  const lines: string[] = [];

  lines.push("section,key,value");
  lines.push(`kpi,health_score,${snapshot.kpis.healthScore}`);
  lines.push(`kpi,open_work,${snapshot.kpis.openWork}`);
  lines.push(`kpi,blocked,${snapshot.kpis.blocked}`);
  lines.push(`kpi,overdue,${snapshot.kpis.overdue}`);
  if (snapshot.kpis.bugsOpen != null) {
    lines.push(`kpi,bugs_open,${snapshot.kpis.bugsOpen}`);
  }
  if (snapshot.kpis.sprintCompletionPct != null) {
    lines.push(`kpi,sprint_completion_pct,${snapshot.kpis.sprintCompletionPct}`);
  }
  if (snapshot.kpis.resolvedLast7d != null) {
    lines.push(`kpi,resolved_last_7d,${snapshot.kpis.resolvedLast7d}`);
  }
  lines.push(`meta,generated_at,${snapshot.generatedAt}`);
  lines.push(`meta,project_count,${snapshot.byProject.length}`);

  lines.push("");
  lines.push("project,key,name,health_score,open_issues,blocked,overdue,bugs");
  for (const p of snapshot.byProject) {
    lines.push(
      [
        "project",
        p.key,
        escapeCsv(p.name),
        p.healthScore,
        p.openIssues,
        p.blockedCount,
        p.overdueCount,
        p.bugsOpen,
      ].join(","),
    );
  }

  lines.push("");
  lines.push(
    "version,project_key,project_name,version_name,released,overdue,release_date,open_in_version",
  );
  for (const v of snapshot.versions) {
    lines.push(
      [
        "version",
        v.projectKey,
        escapeCsv(v.projectName),
        escapeCsv(v.name),
        v.released ? "yes" : "no",
        v.overdue ? "yes" : "no",
        v.releaseDate ?? "",
        v.openIssuesInVersion ?? "",
      ].join(","),
    );
  }

  lines.push("");
  lines.push("signal,id,label,severity,category,value");
  for (const s of snapshot.signals) {
    lines.push(
      [
        "signal",
        s.id,
        escapeCsv(s.label),
        s.severity,
        s.category,
        escapeCsv(s.value),
      ].join(","),
    );
  }

  return lines.join("\n");
}

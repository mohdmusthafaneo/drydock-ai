import type { PrimaryRecommendation } from "@/generated/prisma/client";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import { formatMetricsSourceLabel } from "@/lib/observability-metrics/format-source-label";

export type GateVerdict = "GO" | "HOLD" | "NO-GO";

export type SignalGroup = {
  id: "schedule" | "ci" | "metrics" | "alerts" | "other";
  label: string;
  signals: QASignal[];
};

export function verdictFromPrimary(
  primary: PrimaryRecommendation | string | null | undefined,
): GateVerdict | null {
  if (!primary) return null;
  if (primary === "APPROVE") return "GO";
  if (primary === "APPROVE_WITH_SIGNOFF") return "HOLD";
  return "NO-GO";
}

export function verdictBadgeVariant(
  verdict: GateVerdict | null,
): "success" | "warning" | "error" | "muted" {
  if (verdict === "GO") return "success";
  if (verdict === "HOLD") return "warning";
  if (verdict === "NO-GO") return "error";
  return "muted";
}

export function releaseStatusBadgeVariant(
  status: string,
): "success" | "warning" | "ai" | "muted" {
  if (status === "DEPLOYED") return "success";
  if (status === "BLOCKED") return "warning";
  if (status === "PENDING_APPROVAL") return "ai";
  return "muted";
}

export function groupSignalsByArea(signals: QASignal[]): SignalGroup[] {
  const schedule = signals.filter((s) => s.source === "jira");
  const ci = signals.filter((s) => s.source === "github");
  const metrics = signals.filter(
    (s) => s.source === "grafana-proxy" || s.source === "prometheus-direct",
  );
  const alerts = signals.filter((s) => s.source === "grafana");
  const groupedIds = new Set(
    [...schedule, ...ci, ...metrics, ...alerts].map((s) => s.id),
  );
  const other = signals.filter((s) => !groupedIds.has(s.id));

  const groups: SignalGroup[] = [];
  if (schedule.length) groups.push({ id: "schedule", label: "Schedule (Jira)", signals: schedule });
  if (ci.length) groups.push({ id: "ci", label: "CI (GitHub)", signals: ci });
  if (metrics.length) groups.push({ id: "metrics", label: "Metrics", signals: metrics });
  if (alerts.length) groups.push({ id: "alerts", label: "Alerts (Grafana)", signals: alerts });
  if (other.length) groups.push({ id: "other", label: "Other", signals: other });
  return groups;
}

export function topBlockers(gaps: TestGap[], limit = 3): TestGap[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return [...gaps]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, limit);
}

export function formatObservabilityAttribution(telemetry: TelemetrySnapshot): string | null {
  if (telemetry.metricsProvenance) {
    return formatMetricsSourceLabel(telemetry.metricsProvenance);
  }
  if (telemetry.observabilityCoverage && telemetry.observabilityCoverage !== "—") {
    return telemetry.observabilityCoverage;
  }
  return null;
}

export function aggregateGapsByArea(gaps: TestGap[]): Array<{ area: string; count: number }> {
  const counts = new Map<string, number>();
  for (const gap of gaps) {
    counts.set(gap.area, (counts.get(gap.area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count);
}

export function sourceBadgeLabel(source: QASignal["source"]): string {
  switch (source) {
    case "jira":
      return "Jira";
    case "github":
      return "GitHub";
    case "grafana":
      return "Grafana";
    case "prometheus-direct":
      return "Prometheus";
    case "grafana-proxy":
      return "Grafana proxy";
    case "dna":
      return "DNA";
    case "synthetic":
      return "Synthetic";
    default:
      return "—";
  }
}

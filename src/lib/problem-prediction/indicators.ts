import type { StoredCodeAnalysis } from "@/lib/code-analysis/types";
import { readJsonField } from "@/lib/json-field";
import { scopedKpisFromSnapshot } from "@/lib/delivery-analysis/persist";
import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import {
  consecutiveWorsening,
  linearSlope,
  minPointsForTrend,
  percentChange,
  recentAverage,
  thresholdBreached,
} from "@/lib/problem-prediction/trends";
import type {
  PredictionCandidate,
  PredictionDomain,
  PredictionHorizon,
  PredictionSeverity,
} from "@/lib/problem-prediction/types";

export type PredictionContext = {
  deliveryHistory: Array<{
    syncedAt: Date;
    healthScore: number;
    openWork: number;
    snapshotJson: unknown;
  }>;
  codeAnalysis: StoredCodeAnalysis | null;
  complianceFindings: Array<{
    severity: string;
    status: string;
    ruleKey: string;
    projectKey: string | null;
    firstSeenAt: Date;
  }>;
  telemetryMetrics: Array<{
    metricKey: string;
    value: number;
    recordedAt: Date;
  }>;
  deploymentEvents: Array<{
    health: string;
    healthScore: number;
    deployedAt: Date;
  }>;
  incidents: Array<{
    severityScore: number;
    status: string;
    detectedAt: Date;
  }>;
};

export type PredictionIndicatorDefinition = {
  key: string;
  domain: PredictionDomain;
  title: string;
  evaluate: (ctx: PredictionContext) => PredictionCandidate[];
};

function buildKey(indicatorKey: string, scope: string): string {
  return `${indicatorKey}:${scope}`;
}

function parseSnapshot(json: unknown): DeliveryAnalysisSnapshot | null {
  const parsed = readJsonField<DeliveryAnalysisSnapshot | null>(json, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function horizonFromSlope(
  slopeMagnitude: number,
  shortThreshold: number,
  mediumThreshold: number,
): PredictionHorizon {
  if (slopeMagnitude >= shortThreshold) return "short";
  if (slopeMagnitude >= mediumThreshold) return "medium";
  return "long";
}

function confidenceFromSignals(signals: {
  slope?: number;
  streak?: number;
  deltaPct?: number;
  base?: number;
}): number {
  let score = signals.base ?? 0.5;
  if (signals.slope !== undefined) {
    score += Math.min(Math.abs(signals.slope) / 10, 0.25);
  }
  if (signals.streak !== undefined) {
    score += Math.min(signals.streak * 0.05, 0.15);
  }
  if (signals.deltaPct !== undefined) {
    score += Math.min(Math.abs(signals.deltaPct) / 100, 0.2);
  }
  return Math.min(Math.max(score, 0.35), 0.95);
}

function deliverySlipRisk(ctx: PredictionContext): PredictionCandidate[] {
  const history = ctx.deliveryHistory;
  if (!minPointsForTrend(3, history.length)) return [];

  const candidates: PredictionCandidate[] = [];
  const scopes = new Map<string, number[]>();
  const overdueSeries = new Map<string, number[]>();
  const blockedSeries = new Map<string, number[]>();

  for (const row of history) {
    const snapshot = parseSnapshot(row.snapshotJson);
    if (!snapshot) continue;

    const portfolio = scopedKpisFromSnapshot(snapshot, null);
    if (!scopes.has("portfolio")) {
      scopes.set("portfolio", []);
      overdueSeries.set("portfolio", []);
      blockedSeries.set("portfolio", []);
    }
    scopes.get("portfolio")!.push(portfolio.healthScore);
    overdueSeries.get("portfolio")!.push(portfolio.overdue);
    blockedSeries.get("portfolio")!.push(portfolio.blocked);

    for (const project of snapshot.byProject) {
      const pk = project.key;
      if (!scopes.has(pk)) {
        scopes.set(pk, []);
        overdueSeries.set(pk, []);
        blockedSeries.set(pk, []);
      }
      scopes.get(pk)!.push(project.healthScore);
      overdueSeries.get(pk)!.push(project.overdueCount);
      blockedSeries.get(pk)!.push(project.blockedCount);
    }
  }

  for (const [scope, healthScores] of scopes) {
    const overdue = overdueSeries.get(scope) ?? [];
    const blocked = blockedSeries.get(scope) ?? [];
    if (!minPointsForTrend(3, healthScores.length)) continue;

    const healthSlope = linearSlope(healthScores);
    const overdueSlope = linearSlope(overdue);
    const blockedSlope = linearSlope(blocked);
    const healthStreak = consecutiveWorsening(healthScores, (a, b) => b < a);
    const latestHealth = healthScores[healthScores.length - 1]!;
    const priorHealth = healthScores[0]!;

    const healthDeclining =
      healthSlope < -1.5 ||
      healthStreak >= 2 ||
      (latestHealth < 60 && percentChange(latestHealth, priorHealth) < -10);
    const schedulePressure =
      overdueSlope > 0.5 || blockedSlope > 0.3 || recentAverage(overdue, 3) >= 5;

    if (!healthDeclining && !schedulePressure) continue;

    const slopeMag = Math.max(Math.abs(healthSlope), overdueSlope, blockedSlope);
    const severity: PredictionSeverity =
      latestHealth < 50 || recentAverage(overdue, 3) >= 10
        ? "critical"
        : healthDeclining && schedulePressure
          ? "warning"
          : "info";

    const signals = {
      healthSlope,
      overdueSlope,
      blockedSlope,
      healthStreak,
      latestHealth,
      recentOverdueAvg: recentAverage(overdue, 3),
    };

    candidates.push({
      key: buildKey("delivery-slip-risk", scope),
      domain: "delivery",
      severity,
      horizon: horizonFromSlope(slopeMag, 3, 1.5),
      confidence: confidenceFromSignals({
        slope: healthSlope,
        streak: healthStreak,
        deltaPct: percentChange(latestHealth, priorHealth),
        base: schedulePressure ? 0.55 : 0.45,
      }),
      rationale:
        scope === "portfolio"
          ? `Delivery health is trending down (slope ${healthSlope.toFixed(1)}) with rising schedule pressure — release slip risk is elevated.`
          : `Project ${scope} health is declining with overdue/blocked work rising — slip risk is elevated for this project.`,
      signals,
      projectKey: scope === "portfolio" ? null : scope,
    });
  }

  return candidates;
}

function incidentLikelihoodRising(ctx: PredictionContext): PredictionCandidate[] {
  const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentIncidents = ctx.incidents.filter(
    (i) => i.detectedAt.getTime() >= since30d && i.status !== "CLOSED",
  );
  const openIncidents = ctx.incidents.filter((i) => i.status !== "CLOSED");

  const degradedDeploys = ctx.deploymentEvents.filter(
    (d) =>
      d.deployedAt.getTime() >= since30d &&
      (d.health === "DEGRADED" || d.health === "FAILED"),
  );

  const errorMetrics = ctx.telemetryMetrics
    .filter(
      (m) =>
        m.recordedAt.getTime() >= since30d &&
        /error|failure|alert/i.test(m.metricKey),
    )
    .map((m) => m.value);

  const deployFailureRate =
    ctx.deploymentEvents.filter((d) => d.deployedAt.getTime() >= since30d).length > 0
      ? degradedDeploys.length /
        ctx.deploymentEvents.filter((d) => d.deployedAt.getTime() >= since30d).length
      : 0;

  const avgSeverity =
    recentIncidents.length > 0
      ? recentIncidents.reduce((s, i) => s + i.severityScore, 0) / recentIncidents.length
      : 0;

  const errorSlope = linearSlope(errorMetrics);
  const errorStreak = consecutiveWorsening(errorMetrics, (a, b) => b > a);

  const incidentSignal =
    openIncidents.length >= 2 ||
    recentIncidents.length >= 3 ||
    avgSeverity >= 60;
  const deploySignal = deployFailureRate >= 0.25 || degradedDeploys.length >= 2;
  const telemetrySignal =
    errorMetrics.length >= 3 &&
    (errorSlope > 0.5 || errorStreak >= 2 || thresholdBreached(recentAverage(errorMetrics, 5), 5, "above"));

  if (!incidentSignal && !deploySignal && !telemetrySignal) return [];

  const severity: PredictionSeverity =
    openIncidents.length >= 3 || deployFailureRate >= 0.4
      ? "critical"
      : incidentSignal && (deploySignal || telemetrySignal)
        ? "warning"
        : "info";

  const signals = {
    openIncidents: openIncidents.length,
    recentIncidents: recentIncidents.length,
    avgSeverity,
    deployFailureRate,
    degradedDeploys: degradedDeploys.length,
    errorSlope,
    errorStreak,
  };

  return [
    {
      key: buildKey("incident-likelihood-rising", "org"),
      domain: "devops",
      severity,
      horizon: deploySignal || errorStreak >= 2 ? "short" : "medium",
      confidence: confidenceFromSignals({
        slope: errorSlope,
        streak: errorStreak,
        base: incidentSignal ? 0.6 : 0.5,
      }),
      rationale:
        "Incident, deployment health, and observability signals are worsening — likelihood of further production incidents is rising.",
      signals,
      projectKey: null,
    },
  ];
}

function complianceDrift(ctx: PredictionContext): PredictionCandidate[] {
  const open = ctx.complianceFindings.filter((f) => f.status === "open");
  if (open.length === 0) return [];

  const criticalOpen = open.filter((f) => f.severity === "critical").length;
  const warningOpen = open.filter((f) => f.severity === "warning").length;
  const since14d = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const newRecent = open.filter((f) => f.firstSeenAt.getTime() >= since14d).length;

  const byProject = new Map<string, typeof open>();
  for (const finding of open) {
    const pk = finding.projectKey ?? "org";
    const list = byProject.get(pk) ?? [];
    list.push(finding);
    byProject.set(pk, list);
  }

  const candidates: PredictionCandidate[] = [];

  const orgDrift =
    criticalOpen >= 2 ||
    (criticalOpen >= 1 && warningOpen >= 3) ||
    (open.length >= 5 && newRecent >= 3);

  if (orgDrift) {
    candidates.push({
      key: buildKey("compliance-drift", "org"),
      domain: "compliance",
      severity: criticalOpen >= 2 ? "critical" : criticalOpen >= 1 ? "warning" : "info",
      horizon: newRecent >= 3 ? "short" : "medium",
      confidence: confidenceFromSignals({
        base: 0.55 + Math.min(open.length / 20, 0.25),
        deltaPct: percentChange(newRecent, open.length - newRecent),
      }),
      rationale: `${open.length} open compliance finding${open.length === 1 ? "" : "s"} (${criticalOpen} critical) with ${newRecent} opened in the last 14 days — governance drift is accelerating.`,
      signals: { openCount: open.length, criticalOpen, warningOpen, newRecent },
      projectKey: null,
    });
  }

  for (const [scope, findings] of byProject) {
    if (scope === "org") continue;
    const projCritical = findings.filter((f) => f.severity === "critical").length;
    if (findings.length < 3 && projCritical === 0) continue;

    candidates.push({
      key: buildKey("compliance-drift", scope),
      domain: "compliance",
      severity: projCritical >= 1 ? "warning" : "info",
      horizon: "medium",
      confidence: confidenceFromSignals({ base: 0.5 + findings.length * 0.03 }),
      rationale: `Project ${scope} has ${findings.length} open compliance finding${findings.length === 1 ? "" : "s"} — localized governance drift detected.`,
      signals: { openCount: findings.length, criticalOpen: projCritical, projectKey: scope },
      projectKey: scope,
    });
  }

  return candidates;
}

function planningRisk(ctx: PredictionContext): PredictionCandidate[] {
  const history = ctx.deliveryHistory;
  if (!minPointsForTrend(3, history.length)) return [];

  const candidates: PredictionCandidate[] = [];
  const spilloverSeries = new Map<string, number[]>();
  const reopenedSeries = new Map<string, number[]>();
  const sprintPctSeries = new Map<string, number[]>();

  spilloverSeries.set("portfolio", []);
  reopenedSeries.set("portfolio", []);
  sprintPctSeries.set("portfolio", []);

  for (const row of history) {
    const snapshot = parseSnapshot(row.snapshotJson);
    if (!snapshot) continue;

    spilloverSeries.get("portfolio")!.push(snapshot.kpis.spillover ?? 0);
    reopenedSeries.get("portfolio")!.push(snapshot.kpis.reopened ?? 0);
    sprintPctSeries.get("portfolio")!.push(snapshot.kpis.sprintCompletionPct ?? 100);

    for (const project of snapshot.byProject) {
      const pk = project.key;
      if (!spilloverSeries.has(pk)) {
        spilloverSeries.set(pk, []);
        reopenedSeries.set(pk, []);
        sprintPctSeries.set(pk, []);
      }
      spilloverSeries.get(pk)!.push(project.spilloverCount ?? 0);
      reopenedSeries.get(pk)!.push(project.reopenedCount ?? 0);
      const sprintPct = project.activeSprint?.pct ?? 100;
      sprintPctSeries.get(pk)!.push(sprintPct);
    }
  }

  const highRiskPrs =
    ctx.codeAnalysis?.pullRequests.filter(
      (pr) => (pr.riskScore ?? 0) >= 70 && pr.riskLevel !== "low",
    ).length ?? 0;

  for (const [scope, spillover] of spilloverSeries) {
    const reopened = reopenedSeries.get(scope) ?? [];
    const sprintPct = sprintPctSeries.get(scope) ?? [];
    if (!minPointsForTrend(3, spillover.length)) continue;

    const spilloverSlope = linearSlope(spillover);
    const reopenedSlope = linearSlope(reopened);
    const sprintSlope = linearSlope(sprintPct);
    const spilloverStreak = consecutiveWorsening(spillover, (a, b) => b > a);
    const sprintStreak = consecutiveWorsening(sprintPct, (a, b) => b < a);
    const latestSpillover = spillover[spillover.length - 1]!;
    const latestSprintPct = sprintPct[sprintPct.length - 1] ?? 100;

    const planningPressure =
      spilloverSlope > 0.3 ||
      reopenedSlope > 0.2 ||
      spilloverStreak >= 2 ||
      latestSpillover >= 5;
    const sprintRisk = sprintSlope < -2 || sprintStreak >= 2 || latestSprintPct < 50;
    const codeRisk = scope === "portfolio" && highRiskPrs >= 3;

    if (!planningPressure && !sprintRisk && !codeRisk) continue;

    const severity: PredictionSeverity =
      (planningPressure && sprintRisk) || latestSpillover >= 10
        ? "critical"
        : planningPressure || sprintRisk
          ? "warning"
          : "info";

    const signals = {
      spilloverSlope,
      reopenedSlope,
      sprintSlope,
      spilloverStreak,
      sprintStreak,
      latestSpillover,
      latestSprintPct,
      highRiskPrs: scope === "portfolio" ? highRiskPrs : undefined,
    };

    candidates.push({
      key: buildKey("planning-risk", scope),
      domain: "planning",
      severity,
      horizon: sprintRisk || spilloverStreak >= 2 ? "short" : "medium",
      confidence: confidenceFromSignals({
        slope: spilloverSlope,
        streak: spilloverStreak,
        base: sprintRisk ? 0.58 : 0.48,
      }),
      rationale:
        scope === "portfolio"
          ? "Spillover, reopened work, or sprint completion trends indicate planning instability ahead."
          : `Project ${scope} shows rising spillover/reopened work or declining sprint completion — planning risk is elevated.`,
      signals,
      projectKey: scope === "portfolio" ? null : scope,
    });
  }

  return candidates;
}

export const PREDICTION_INDICATOR_CATALOG: PredictionIndicatorDefinition[] = [
  {
    key: "delivery-slip-risk",
    domain: "delivery",
    title: "Delivery slip risk",
    evaluate: deliverySlipRisk,
  },
  {
    key: "incident-likelihood-rising",
    domain: "devops",
    title: "Incident likelihood rising",
    evaluate: incidentLikelihoodRising,
  },
  {
    key: "compliance-drift",
    domain: "compliance",
    title: "Compliance drift",
    evaluate: complianceDrift,
  },
  {
    key: "planning-risk",
    domain: "planning",
    title: "Planning risk",
    evaluate: planningRisk,
  },
];

export function indicatorsForCatalog(): PredictionIndicatorDefinition[] {
  return PREDICTION_INDICATOR_CATALOG;
}

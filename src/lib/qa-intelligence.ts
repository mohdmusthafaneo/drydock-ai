import type { DeliveryDNA, Integration, OrganizationProfile } from "@/generated/prisma/client";
import type { GitHubAssessContext } from "@/lib/github-assess-context";
import type { GrafanaAssessContext } from "@/lib/grafana-assess-context";
import type { JiraAssessContext } from "@/lib/jira-delivery-health";
import { isJiraOAuthConnected } from "@/lib/jira-meta";
import type { MetricsAssessContext } from "@/lib/observability-metrics/types";
import {
  hasLiveObservability,
  resolveMetricsAssessContext,
  type PrometheusAssessContext,
} from "@/lib/observability-connectivity";
import { formatMetricsSourceShort } from "@/lib/observability-metrics/format-source-label";

/** Master FRD §11 — QA Intelligence Workflow */
export const QA_INTELLIGENCE_WORKFLOW = [
  "Import repositories & test suites",
  "Analyze coverage gaps",
  "Generate missing test scenarios",
  "Execute regression intelligence",
  "Analyze failures & anomalies",
  "Generate release readiness score",
  "Human approval for release",
] as const;

export type QASignal = {
  id: string;
  category: "regression" | "coverage" | "performance" | "stability";
  label: string;
  value: string;
  severity: "info" | "warning" | "critical";
};

export type TestGap = {
  area: string;
  gap: string;
  priority: "low" | "medium" | "high";
};

export type QAAssessment = {
  signals: QASignal[];
  testGaps: TestGap[];
  readinessScore: number;
  regressionNotes: string;
};

function formatPerformanceSignal(
  metrics: MetricsAssessContext,
  prometheus: PrometheusAssessContext | undefined,
  grafana: GrafanaAssessContext | undefined,
  liveObs: ReturnType<typeof hasLiveObservability>,
): Pick<QASignal, "value" | "severity"> {
  if (metrics.synced && metrics.snapshot && metrics.provenance) {
    const { kpis } = metrics.snapshot;
    const source = formatMetricsSourceShort(metrics.provenance);

    if (kpis.p95LatencyDelta != null) {
      const sign = kpis.p95LatencyDelta > 0 ? "+" : "";
      const severity =
        kpis.p95LatencyDelta > 25 ? "critical" : kpis.p95LatencyDelta > 15 ? "warning" : "info";
      return {
        value: `P95 ${sign}${kpis.p95LatencyDelta}ms vs previous sync (${source})`,
        severity,
      };
    }
    if (kpis.errorRateDelta != null) {
      const sign = kpis.errorRateDelta > 0 ? "+" : "";
      const severity = kpis.errorRateDelta > 0.5 ? "warning" : "info";
      return {
        value: `Error rate ${sign}${kpis.errorRateDelta}% vs previous sync (${source})`,
        severity,
      };
    }
    return {
      value: `${source} health ${kpis.healthScore}/100 — P95 ${kpis.p95LatencyMs}ms, error ${kpis.errorRate}%`,
      severity: kpis.healthScore < 60 ? "warning" : "info",
    };
  }

  if (prometheus?.synced && prometheus.snapshot) {
    const { kpis } = prometheus.snapshot;
    if (kpis.p95LatencyDelta != null) {
      const sign = kpis.p95LatencyDelta > 0 ? "+" : "";
      const severity =
        kpis.p95LatencyDelta > 25 ? "critical" : kpis.p95LatencyDelta > 15 ? "warning" : "info";
      return {
        value: `P95 ${sign}${kpis.p95LatencyDelta}ms vs previous sync (Prometheus)`,
        severity,
      };
    }
    if (kpis.errorRateDelta != null) {
      const sign = kpis.errorRateDelta > 0 ? "+" : "";
      const severity = kpis.errorRateDelta > 0.5 ? "warning" : "info";
      return {
        value: `Error rate ${sign}${kpis.errorRateDelta}% vs previous sync (Prometheus)`,
        severity,
      };
    }
    return {
      value: `Prometheus health ${kpis.healthScore}/100 — no delta available`,
      severity: kpis.healthScore < 60 ? "warning" : "info",
    };
  }

  if (grafana?.synced && grafana.snapshot) {
    const { healthScore } = grafana.snapshot.kpis;
    return {
      value: `Grafana health ${healthScore}/100 (alerts + dashboard coverage)`,
      severity: healthScore < 40 ? "critical" : healthScore < 60 ? "warning" : "info",
    };
  }

  if (liveObs.any) {
    return {
      value: "Observability connected — run sync on Integrations for live metrics",
      severity: "warning",
    };
  }

  return {
    value: "No metrics — connect Grafana or Prometheus on Integrations",
    severity: "warning",
  };
}

function formatStabilitySignal(
  metrics: MetricsAssessContext,
  environment: string,
  liveObs: ReturnType<typeof hasLiveObservability>,
): Pick<QASignal, "value" | "severity"> {
  if (metrics.synced && metrics.snapshot && metrics.provenance) {
    const { kpis } = metrics.snapshot;
    const source = formatMetricsSourceShort(metrics.provenance);

    if (kpis.errorBudgetRemainingPct != null) {
      return {
        value: `Error budget ${kpis.errorBudgetRemainingPct}% remaining (${source})`,
        severity:
          kpis.errorBudgetRemainingPct < 30
            ? "critical"
            : kpis.errorBudgetRemainingPct < 50
              ? "warning"
              : "info",
      };
    }

    if (kpis.errorRate > 0.5) {
      return {
        value: `Error rate ${kpis.errorRate}% (${source})`,
        severity: kpis.errorRate > 1 ? "critical" : "warning",
      };
    }

    return {
      value: `Within budget — error rate ${kpis.errorRate}% (${source})`,
      severity: "info",
    };
  }

  if (environment !== "PRODUCTION") {
    return { value: "Within budget for non-prod", severity: "info" };
  }

  if (liveObs.any) {
    return {
      value: "Run metrics sync on Integrations for error budget signal",
      severity: "warning",
    };
  }

  return {
    value: "No error budget signal — connect observability",
    severity: "warning",
  };
}

function formatRegressionSignal(github: GitHubAssessContext | undefined): Pick<QASignal, "value" | "severity"> {
  if (!github?.connected) {
    return { value: "No CI signal — connect GitHub", severity: "warning" };
  }

  if (!github.synced) {
    return {
      value: "GitHub connected — run sync on Integrations for CI signals",
      severity: "warning",
    };
  }

  const ci = github.ci;
  if (!ci || ci.passRatePct == null) {
    return {
      value: "No CI runs in scope — check branch filter or run GitHub sync",
      severity: "warning",
    };
  }

  const branchNote =
    ci.consecutiveFailures > 0 ? ` · ${ci.consecutiveFailures} consecutive failure(s)` : "";

  return {
    value: `${ci.passRatePct}% pass rate on recent workflow runs${branchNote}`,
    severity:
      ci.passRatePct >= 80 ? "info" : ci.passRatePct >= 60 ? "warning" : "critical",
  };
}

export function assessQAIntelligence(input: {
  profile: OrganizationProfile | null;
  dna: DeliveryDNA;
  integrations: Integration[];
  releaseName: string;
  environment: string;
  jira?: JiraAssessContext;
  grafana?: GrafanaAssessContext;
  prometheus?: PrometheusAssessContext;
  metrics?: MetricsAssessContext;
  github?: GitHubAssessContext;
}): QAAssessment {
  const tools = input.profile
    ? (JSON.parse(input.profile.toolsJson || "[]") as string[])
    : [];
  const connected = input.integrations.filter((i) => i.status === "CONNECTED");
  const github = input.github;
  const hasGithub =
    github?.connected ??
    (connected.some((i) => i.provider === "GITHUB") || tools.includes("github"));
  const githubSynced = github?.synced ?? false;
  const liveObs = hasLiveObservability({ integrations: input.integrations, tools });
  const metrics =
    input.metrics ?? resolveMetricsAssessContext({ integrations: input.integrations });
  const hasJira = input.jira?.connected ?? connected.some((i) => isJiraOAuthConnected(i));
  const jiraSynced = input.jira?.synced ?? false;
  const jiraHealth = input.jira?.health ?? null;

  const performance = formatPerformanceSignal(
    metrics,
    input.prometheus,
    input.grafana,
    liveObs,
  );
  const stability = formatStabilitySignal(metrics, input.environment, liveObs);
  const regression = formatRegressionSignal(github);

  const signals: QASignal[] = [
    {
      id: "regression-suite",
      category: "regression",
      label: "Regression suite",
      value: regression.value,
      severity: regression.severity,
    },
    {
      id: "coverage",
      category: "coverage",
      label: "Critical path coverage",
      value: input.dna.governanceScore >= 70 ? "82% covered" : "68% covered — below target",
      severity: input.dna.governanceScore >= 70 ? "info" : "warning",
    },
    {
      id: "performance",
      category: "performance",
      label: "P95 latency vs baseline",
      value: performance.value,
      severity: performance.severity,
    },
    {
      id: "stability",
      category: "stability",
      label: "Error budget burn",
      value: stability.value,
      severity: stability.severity,
    },
  ];

  if (input.grafana?.synced && input.grafana.openAlerts > 0) {
    signals.push({
      id: "grafana-alerts",
      category: "stability",
      label: "Grafana — firing alerts",
      value: `${input.grafana.openAlerts} open alert${input.grafana.openAlerts === 1 ? "" : "s"}`,
      severity: input.grafana.snapshot?.kpis.firingCritical
        ? input.grafana.snapshot.kpis.firingCritical > 0
          ? "critical"
          : "warning"
        : "warning",
    });
  }

  if (hasJira && jiraHealth) {
    for (const js of jiraHealth.signals) {
      signals.push({
        id: js.id,
        category: js.category === "quality" ? "coverage" : "stability",
        label: `Jira — ${js.label}`,
        value: js.value,
        severity: js.severity,
      });
    }
  } else if (hasJira) {
    signals.push({
      id: "jira-sync",
      category: "stability",
      label: "Jira delivery data",
      value: jiraSynced ? "No snapshot" : "Connected — run sync on Integrations",
      severity: "warning",
    });
  }

  const testGaps: TestGap[] = [];
  if (!hasJira) {
    testGaps.push({
      area: "Traceability",
      gap: "Release not linked to Jira test cycles",
      priority: "high",
    });
  } else if (!jiraSynced) {
    testGaps.push({
      area: "Traceability",
      gap: "Run Jira sync on Integrations to load delivery health",
      priority: "high",
    });
  } else if (jiraHealth) {
    for (const gap of jiraHealth.gaps) {
      testGaps.push({
        area: gap.area,
        gap: gap.gap,
        priority: gap.priority,
      });
    }
  }

  if (!hasGithub) {
    testGaps.push({
      area: "Automation",
      gap: "No automated regression signal from CI",
      priority: "high",
    });
  } else if (!githubSynced) {
    testGaps.push({
      area: "Automation",
      gap: "Run GitHub sync on Integrations for CI pass rate",
      priority: "high",
    });
  } else if (github?.ci?.passRatePct == null) {
    testGaps.push({
      area: "Automation",
      gap: "No workflow runs found in synced repositories",
      priority: "medium",
    });
  } else if (github.ci.passRatePct < 80) {
    testGaps.push({
      area: "Automation",
      gap: `CI pass rate ${github.ci.passRatePct}% below 80% target`,
      priority: "high",
    });
  }

  if (input.dna.governanceScore < 60) {
    testGaps.push({
      area: "Governance",
      gap: "Governance score below org threshold — expand sign-off coverage",
      priority: "medium",
    });
  }

  if (input.environment === "PRODUCTION" && !liveObs.any) {
    testGaps.push({
      area: "Observability",
      gap: "Production release without live telemetry correlation",
      priority: "high",
    });
  }

  if (liveObs.any && !metrics.synced) {
    testGaps.push({
      area: "Observability",
      gap: "Run sync on Integrations for live metrics",
      priority: "high",
    });
  }

  if (input.grafana?.connected && !input.grafana.synced) {
    testGaps.push({
      area: "Observability",
      gap: "Run Grafana sync on Integrations for alert and deployment signals",
      priority: "medium",
    });
  }

  if (metrics.synced && metrics.snapshot) {
    for (const gap of metrics.snapshot.gaps ?? []) {
      testGaps.push({
        area: gap.area,
        gap: gap.gap,
        priority: gap.priority,
      });
    }
  }

  if (input.grafana?.synced && input.grafana.snapshot?.gaps) {
    for (const gap of input.grafana.snapshot.gaps) {
      testGaps.push({
        area: gap.area,
        gap: gap.gap,
        priority: gap.priority,
      });
    }
  }

  const penalty =
    testGaps.filter((g) => g.priority === "high").length * 12 +
    testGaps.filter((g) => g.priority === "medium").length * 6 +
    signals.filter((s) => s.severity === "warning").length * 4;

  const ciPassRate = github?.ci?.passRatePct;
  const ciBonus = ciPassRate != null && ciPassRate >= 80 ? 5 : 0;

  let readinessScore = Math.max(0, Math.min(100, 88 - penalty + ciBonus));

  if (jiraHealth) {
    readinessScore = Math.round(readinessScore * 0.55 + jiraHealth.score * 0.45);
  }

  let regressionNotes: string;
  if (githubSynced && github?.ci?.passRatePct != null) {
    const ci = github.ci;
    regressionNotes = `${input.releaseName}: CI pass rate ${ci.passRatePct}%`;
    if (ci.consecutiveFailures > 0) {
      regressionNotes += `; ${ci.consecutiveFailures} consecutive failure(s)`;
    }
    if (ci.lastConclusion === "failure") {
      regressionNotes += "; latest run failed";
    }
    regressionNotes += ".";
  } else if (hasGithub && !githubSynced) {
    regressionNotes = `${input.releaseName}: GitHub connected — run sync on Integrations before assess.`;
  } else {
    regressionNotes = `${input.releaseName}: regression intelligence unavailable until GitHub CI is connected.`;
  }

  if (jiraHealth) {
    const jiraParts = [
      `Jira delivery health ${jiraHealth.score}/100`,
      jiraHealth.matchedVersion
        ? `matched fix version ${jiraHealth.matchedVersion.versionName} (${jiraHealth.matchedVersion.projectKey})`
        : "no fix version match",
    ];
    if (jiraHealth.scopedProject) {
      jiraParts.push(`scope ${jiraHealth.scopedProject.key}`);
    }
    regressionNotes = `${input.releaseName}: ${jiraParts.join("; ")}. ${regressionNotes.replace(`${input.releaseName}: `, "")}`;
  } else if (hasJira && !jiraSynced) {
    regressionNotes = `${input.releaseName}: Jira connected — run sync on Integrations before assess. ${regressionNotes.replace(`${input.releaseName}: `, "")}`;
  }

  return { signals, testGaps, readinessScore, regressionNotes };
}

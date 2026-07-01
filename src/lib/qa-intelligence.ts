import type { DeliveryDNA, Integration, OrganizationProfile } from "@/generated/prisma/client";
import type { CodeAnalysisAssessContext } from "@/lib/code-analysis-assess-context";
import type { GitHubAssessContext } from "@/lib/github-assess-context";
import type { GrafanaAssessContext } from "@/lib/grafana-assess-context";
import type { JiraAssessContext } from "@/lib/jira-delivery-health";
import { isJiraOAuthConnected } from "@/lib/jira-meta";
import type { MetricsAssessContext } from "@/lib/observability-metrics/types";
import { applyHygieneScoreDiscount } from "@/lib/jira-hygiene";
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

export type QASignalSource =
  | "jira"
  | "github"
  | "grafana"
  | "prometheus-direct"
  | "grafana-proxy"
  | "dna"
  | "synthetic";

export type QASignal = {
  id: string;
  category: "regression" | "coverage" | "performance" | "stability";
  label: string;
  value: string;
  severity: "info" | "warning" | "critical";
  source?: QASignalSource;
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

function computeWeightedReadiness(input: {
  dna: DeliveryDNA;
  jiraHealth: JiraAssessContext["health"];
  metrics: MetricsAssessContext;
  github?: GitHubAssessContext;
  testGaps: TestGap[];
  signals: QASignal[];
  jiraHygiene?: { degradesTrust: boolean; portfolioScore: number } | null;
}): number {
  const components: Array<{ weight: number; score: number }> = [];

  if (input.jiraHealth) {
    components.push({ weight: 0.35, score: input.jiraHealth.score });
  }

  if (input.metrics.synced && input.metrics.snapshot) {
    components.push({ weight: 0.25, score: input.metrics.snapshot.kpis.healthScore });
  }

  const ciPassRate = input.github?.ci?.passRatePct;
  if (ciPassRate != null) {
    components.push({ weight: 0.2, score: ciPassRate });
  }

  components.push({ weight: 0.2, score: input.dna.governanceScore });

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  let blended =
    totalWeight > 0
      ? components.reduce((sum, c) => sum + c.score * (c.weight / totalWeight), 0)
      : 88;

  const penalty =
    input.testGaps.filter((g) => g.priority === "high").length * 8 +
    input.testGaps.filter((g) => g.priority === "medium").length * 4 +
    input.signals.filter((s) => s.severity === "warning").length * 3 +
    input.signals.filter((s) => s.severity === "critical").length * 6;

  let score = Math.max(0, Math.min(100, Math.round(blended - penalty)));

  if (input.jiraHygiene?.degradesTrust) {
    score = applyHygieneScoreDiscount(score, input.jiraHygiene);
  }

  return score;
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
  codeAnalysis?: CodeAnalysisAssessContext;
  jiraHygiene?: { degradesTrust: boolean; portfolioScore: number } | null;
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

  const metricsSource: QASignalSource | undefined = metrics.synced
    ? metrics.provenance?.path === "prometheus-direct"
      ? "prometheus-direct"
      : metrics.provenance?.path === "grafana-datasource-proxy"
        ? "grafana-proxy"
        : undefined
    : undefined;

  const signals: QASignal[] = [
    {
      id: "regression-suite",
      category: "regression",
      label: "Regression suite",
      value: regression.value,
      severity: regression.severity,
      source: githubSynced ? "github" : undefined,
    },
    {
      id: "coverage",
      category: "coverage",
      label: "Critical path coverage",
      value:
        input.dna.governanceScore >= 70
          ? `${input.dna.governanceScore}% governance posture`
          : `${input.dna.governanceScore}% governance posture — below target`,
      severity: input.dna.governanceScore >= 70 ? "info" : "warning",
      source: "dna",
    },
    {
      id: "performance",
      category: "performance",
      label: "P95 latency vs baseline",
      value: performance.value,
      severity: performance.severity,
      source: metricsSource ?? (input.grafana?.synced ? "grafana" : undefined),
    },
    {
      id: "stability",
      category: "stability",
      label: "Error budget burn",
      value: stability.value,
      severity: stability.severity,
      source: metricsSource,
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
      source: "grafana",
    });
  }

  const codeAnalysis = input.codeAnalysis;
  if (codeAnalysis?.synced && codeAnalysis.aiLinesPct != null) {
    const reviewPct = codeAnalysis.reviewCoverageOnAiPrsPct;
    signals.push({
      id: "github-ai-coverage",
      category: "coverage",
      label: "AI-assisted change",
      value:
        reviewPct != null
          ? `${codeAnalysis.aiLinesPct}% AI-assisted lines · ${reviewPct}% review coverage on AI PRs`
          : `${codeAnalysis.aiLinesPct}% AI-assisted lines in release window`,
      severity:
        codeAnalysis.aiLinesPct > 30 && reviewPct != null && reviewPct < 70
          ? "warning"
          : "info",
      source: "github",
    });

    for (const gs of codeAnalysis.governanceSignals.slice(0, 3)) {
      signals.push({
        id: `code-gov-${gs.id}`,
        category: "coverage",
        label: `Code governance — ${gs.title}`,
        value: gs.description,
        severity: gs.severity === "error" ? "critical" : gs.severity === "warning" ? "warning" : "info",
        source: "github",
      });
    }
  } else if (codeAnalysis?.connected && !codeAnalysis.synced) {
    signals.push({
      id: "code-analysis-sync",
      category: "coverage",
      label: "Code analysis",
      value: "GitHub connected — run code analysis sync for AI governance signals",
      severity: "warning",
      source: "github",
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
        source: "jira",
      });
    }
  } else if (hasJira) {
    signals.push({
      id: "jira-sync",
      category: "stability",
      label: "Jira delivery data",
      value: jiraSynced ? "No snapshot" : "Connected — run sync on Integrations",
      severity: "warning",
      source: "jira",
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

  if (
    codeAnalysis?.synced &&
    codeAnalysis.aiLinesPct != null &&
    codeAnalysis.reviewCoverageOnAiPrsPct != null &&
    codeAnalysis.aiLinesPct > 30 &&
    codeAnalysis.reviewCoverageOnAiPrsPct < 70
  ) {
    testGaps.push({
      area: "Governance",
      gap: `AI-assisted changes at ${codeAnalysis.aiLinesPct}% with only ${codeAnalysis.reviewCoverageOnAiPrsPct}% review coverage on AI PRs`,
      priority: "high",
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

  const readinessScore = computeWeightedReadiness({
    dna: input.dna,
    jiraHealth,
    metrics,
    github,
    testGaps,
    signals,
    jiraHygiene: input.jiraHygiene,
  });

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

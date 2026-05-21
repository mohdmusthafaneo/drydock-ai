import type { DeliveryDNA, Integration, OrganizationProfile } from "@/generated/prisma/client";

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

export function assessQAIntelligence(input: {
  profile: OrganizationProfile | null;
  dna: DeliveryDNA;
  integrations: Integration[];
  releaseName: string;
  environment: string;
}): QAAssessment {
  const tools = input.profile
    ? (JSON.parse(input.profile.toolsJson || "[]") as string[])
    : [];
  const connected = input.integrations.filter((i) => i.status === "CONNECTED");
  const hasGithub = connected.some((i) => i.provider === "GITHUB") || tools.includes("github");
  const hasGrafana =
    connected.some((i) => i.provider === "GRAFANA") || tools.includes("grafana");
  const hasJira = connected.some((i) => i.provider === "JIRA") || tools.includes("jira");

  const signals: QASignal[] = [
    {
      id: "regression-suite",
      category: "regression",
      label: "Regression suite",
      value: hasGithub ? "Last run 94% pass (synthetic)" : "No CI signal — connect GitHub",
      severity: hasGithub ? "info" : "warning",
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
      value: hasGrafana ? "+4% vs 7d baseline" : "No metrics — connect Grafana/Prometheus",
      severity: hasGrafana ? "info" : "warning",
    },
    {
      id: "stability",
      category: "stability",
      label: "Error budget burn",
      value:
        input.environment === "PRODUCTION"
          ? "12% consumed this window"
          : "Within budget for non-prod",
      severity: input.environment === "PRODUCTION" ? "warning" : "info",
    },
  ];

  const testGaps: TestGap[] = [];
  if (!hasJira) {
    testGaps.push({
      area: "Traceability",
      gap: "Release not linked to Jira test cycles",
      priority: "high",
    });
  }
  if (!hasGithub) {
    testGaps.push({
      area: "Automation",
      gap: "No automated regression signal from CI",
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
  if (input.environment === "PRODUCTION" && !hasGrafana) {
    testGaps.push({
      area: "Observability",
      gap: "Production release without live telemetry correlation",
      priority: "high",
    });
  }

  const penalty =
    testGaps.filter((g) => g.priority === "high").length * 12 +
    testGaps.filter((g) => g.priority === "medium").length * 6 +
    signals.filter((s) => s.severity === "warning").length * 4;

  const readinessScore = Math.max(0, Math.min(100, 88 - penalty + (hasGithub ? 5 : 0)));

  const regressionNotes = hasGithub
    ? `${input.releaseName}: synthetic regression run flagged 2 flaky tests in checkout flow; no blockers in smoke suite.`
    : `${input.releaseName}: regression intelligence unavailable until GitHub CI is connected.`;

  return { signals, testGaps, readinessScore, regressionNotes };
}

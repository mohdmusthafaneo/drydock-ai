export type DiscoveryAnswers = {
  organizationName: string;
  industryType: string;
  teamSize: string;
  sdlcMaturity: number;
  devopsMaturity: number;
  governanceLevel: number;
  complianceType: string;
  deploymentStrategy: string;
  tools: string[];
  workflows: string[];
};

export type GeneratedDeliveryDNA = {
  workflowMode: string;
  approvalLevel: number;
  riskThreshold: number;
  autonomyMode: "OBSERVE" | "RECOMMEND" | "ASSIST";
  autonomyLevel: number;
  governanceScore: number;
  escalationMatrix: Record<string, string>;
  observabilityStrategy: string;
  summary: string;
};

export function generateDeliveryDNA(
  answers: DiscoveryAnswers,
): GeneratedDeliveryDNA {
  const avgMaturity =
    (answers.sdlcMaturity + answers.devopsMaturity + answers.governanceLevel) /
    3;

  const approvalLevel = Math.min(
    5,
    Math.max(1, Math.round(6 - answers.governanceLevel)),
  );

  const riskThreshold = Math.max(
    0.2,
    Math.min(0.9, 1 - answers.governanceLevel * 0.12),
  );

  let autonomyMode: GeneratedDeliveryDNA["autonomyMode"] = "RECOMMEND";
  let autonomyLevel = 2;

  if (avgMaturity < 2) {
    autonomyMode = "OBSERVE";
    autonomyLevel = 1;
  } else if (avgMaturity >= 4 && answers.governanceLevel >= 4) {
    autonomyMode = "ASSIST";
    autonomyLevel = 3;
  }

  const governanceScore = Math.round(
    answers.governanceLevel * 18 +
      answers.devopsMaturity * 6 +
      (answers.complianceType !== "none" ? 10 : 0),
  );

  const workflowMode =
    answers.teamSize === "1-10"
      ? "lean-mvp"
      : answers.teamSize === "11-50"
        ? "scaled-agile"
        : "enterprise-governed";

  const escalationMatrix: Record<string, string> = {
    low: "Team lead review",
    medium: "Delivery manager approval",
    high: "Engineering manager + compliance review",
    critical: "Executive escalation within 4h",
  };

  const observabilityStrategy =
    answers.tools.includes("grafana") || answers.tools.includes("prometheus")
      ? "Metrics-first correlation with deployment and incident signals"
      : "Establish baseline metrics ingestion before expanding AI autonomy";

  const summary = [
    `${answers.organizationName} operates in ${answers.industryType || "general"} with ${workflowMode} delivery.`,
    `Governance posture favors ${autonomyMode.toLowerCase()} mode (level ${autonomyLevel}).`,
    `Approval depth: level ${approvalLevel}; risk threshold ${(riskThreshold * 100).toFixed(0)}%.`,
    observabilityStrategy,
  ].join(" ");

  return {
    workflowMode,
    approvalLevel,
    riskThreshold,
    autonomyMode,
    autonomyLevel,
    governanceScore: Math.min(100, governanceScore),
    escalationMatrix,
    observabilityStrategy,
    summary,
  };
}

type RecImpact = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function generateRecommendations(
  dna: GeneratedDeliveryDNA,
  tools: string[],
  options?: {
    grafanaConnected?: boolean;
    prometheusConnected?: boolean;
  },
) {
  const items: Array<{
    title: string;
    description: string;
    rationale: string;
    impact: RecImpact;
    confidence: number;
    affectedSystems: string[];
  }> = [];

  // Skip when DNA is already recommend-only — the loop is the product default.
  if (dna.autonomyMode !== "RECOMMEND") {
    items.push({
      title: "Enable human-governed recommendation loop",
      description:
        "Route all AI-suggested delivery actions through the Approval Center before execution.",
      rationale: `Delivery DNA sets autonomy to ${dna.autonomyMode}, which requires explicit human approval for trust and auditability.`,
      impact: "HIGH",
      confidence: 0.92,
      affectedSystems: ["AIDOS Governance", "Approval Center"],
    });
  }

  if (!tools.includes("jira")) {
    items.push({
      title: "Connect Jira for workflow intelligence",
      description:
        "Sync epics, sprints, and blockers to improve delivery bottleneck detection.",
      rationale:
        "Jira is not connected. Workflow correlation cannot run without issue and sprint context.",
      impact: "MEDIUM",
      confidence: 0.88,
      affectedSystems: ["Jira", "Workflow Orchestration"],
    });
  }

  if (!tools.includes("github")) {
    items.push({
      title: "Connect GitHub for change-risk signals",
      description:
        "Ingest PR velocity, review latency, and deployment tags for release intelligence.",
      rationale:
        "GitHub integration unlocks code-change correlation with incidents and recommendations.",
      impact: "MEDIUM",
      confidence: 0.85,
      affectedSystems: ["GitHub", "Release Intelligence"],
    });
  }

  if (!tools.includes("grafana") && !options?.grafanaConnected) {
    items.push({
      title: "Add Grafana observability connector",
      description:
        "Import dashboards and alert streams to power incident correlation.",
      rationale: dna.observabilityStrategy,
      impact: "HIGH",
      confidence: 0.81,
      affectedSystems: ["Grafana", "Observability Center"],
    });
  }

  if (options?.grafanaConnected && !options.prometheusConnected && !tools.includes("prometheus")) {
    items.push({
      title: "Connect Prometheus for metric KPIs",
      description:
        "Add PromQL-backed error rate and latency signals alongside Grafana alerts.",
      rationale:
        "Grafana covers alerts and dashboards; Prometheus adds numeric metric KPIs for release assess.",
      impact: "MEDIUM",
      confidence: 0.76,
      affectedSystems: ["Prometheus", "Observability Center"],
    });
  }

  if (dna.governanceScore < 60) {
    items.push({
      title: "Tighten approval matrix for production changes",
      description:
        "Require Engineering Manager sign-off on high-impact workflow recommendations.",
      rationale:
        `Governance score is ${dna.governanceScore}/100 — below enterprise readiness threshold.`,
      impact: "CRITICAL",
      confidence: 0.9,
      affectedSystems: ["Governance", "Production"],
    });
  }

  return items;
}

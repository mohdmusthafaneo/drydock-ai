/** Master FRD §7 — Enterprise Workflow Architecture */
export type EnterpriseWorkflowStep = {
  id: string;
  order: number;
  label: string;
  description: string;
  href: string;
};

export const ENTERPRISE_WORKFLOW_STEPS: EnterpriseWorkflowStep[] = [
  {
    id: "auth",
    order: 1,
    label: "Organization access",
    description: "Authenticated workspace with RBAC roles",
    href: "/settings",
  },
  {
    id: "discovery",
    order: 2,
    label: "Discovery & Delivery DNA",
    description: "Map delivery maturity and governance posture",
    href: "/governance/setup",
  },
  {
    id: "integrations",
    order: 3,
    label: "Integration setup",
    description: "GitHub, Jira, Grafana, Prometheus, Slack",
    href: "/integrations",
  },
  {
    id: "workflow-config",
    order: 4,
    label: "Workflow configuration",
    description: "Autonomy mode and execution policy",
    href: "/governance/workflow",
  },
  {
    id: "qa-init",
    order: 5,
    label: "QA intelligence initialization",
    description: "Coverage baselines and regression intelligence",
    href: "/qa",
  },
  {
    id: "telemetry",
    order: 6,
    label: "Observability & telemetry",
    description: "Metrics, incidents, and deployment signals",
    href: "/observability",
  },
  {
    id: "correlation",
    order: 7,
    label: "AI correlation & risk analysis",
    description: "Correlate QA and operational signals",
    href: "/workflow",
  },
  {
    id: "recommendations",
    order: 8,
    label: "Recommendation generation",
    description: "Explainable AI proposals with confidence",
    href: "/recommendations",
  },
  {
    id: "approval",
    order: 9,
    label: "Human approval workflow",
    description: "Governed sign-off before execution",
    href: "/approvals",
  },
  {
    id: "execution",
    order: 10,
    label: "Controlled execution",
    description: "Deployment with audit trail",
    href: "/releases",
  },
  {
    id: "monitoring",
    order: 11,
    label: "Continuous monitoring",
    description: "Post-deploy observability and learning",
    href: "/observability",
  },
];

export function computeCompletedStepIds(input: {
  hasDna: boolean;
  hasProfile: boolean;
  connectedCount: number;
  workflowConfigured: boolean;
  hasAssessedRelease: boolean;
  hasPendingApprovals: boolean;
  hasDeployedRelease: boolean;
  hasOpenIncident: boolean;
  hasTelemetry?: boolean;
}): string[] {
  const done: string[] = ["auth"];

  if (input.hasDna && input.hasProfile) done.push("discovery");
  if (input.connectedCount >= 1) done.push("integrations");
  if (input.workflowConfigured) done.push("workflow-config");
  if (input.hasDna) done.push("qa-init");
  if (input.connectedCount >= 2 || input.hasAssessedRelease || input.hasTelemetry)
    done.push("telemetry");
  if (input.hasAssessedRelease) {
    done.push("correlation", "recommendations");
  }
  if (input.hasAssessedRelease && !input.hasPendingApprovals) done.push("approval");
  if (input.hasDeployedRelease) done.push("execution");
  if (input.hasDeployedRelease && (input.hasTelemetry || !input.hasOpenIncident))
    done.push("monitoring");

  return [...new Set(done)];
}

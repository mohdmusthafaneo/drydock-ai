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
    id: "toolchain-mapping",
    order: 4,
    label: "Delivery toolchain mapping",
    description: "Confirm how your team uses Jira and GitHub workflows",
    href: "/governance/toolchain-mapping",
  },
  {
    id: "jira-calibration",
    order: 4.5,
    label: "Jira workflow calibration",
    description: "Learn done/blocked statuses and release semantics from 90-day history",
    href: "/governance/toolchain-mapping",
  },
  {
    id: "workflow-config",
    order: 5,
    label: "Workflow configuration",
    description: "Autonomy mode and execution policy",
    href: "/governance/workflow",
  },
  {
    id: "qa-init",
    order: 6,
    label: "QA intelligence initialization",
    description: "Coverage baselines and regression intelligence",
    href: "/qa",
  },
  {
    id: "telemetry",
    order: 7,
    label: "Observability & telemetry",
    description: "Metrics, incidents, and deployment signals",
    href: "/observability",
  },
  {
    id: "correlation",
    order: 8,
    label: "AI correlation & risk analysis",
    description: "Correlate QA and operational signals",
    href: "/workflow",
  },
  {
    id: "recommendations",
    order: 9,
    label: "Recommendation generation",
    description: "Explainable AI proposals with confidence",
    href: "/recommendations",
  },
  {
    id: "approval",
    order: 10,
    label: "Human approval workflow",
    description: "Governed sign-off before execution",
    href: "/approvals",
  },
  {
    id: "execution",
    order: 11,
    label: "Controlled execution",
    description: "Deployment with audit trail",
    href: "/releases",
  },
  {
    id: "monitoring",
    order: 12,
    label: "Continuous monitoring",
    description: "Post-deploy observability and learning",
    href: "/observability",
  },
];

export { hasObservabilitySynced } from "@/lib/observability-connectivity";

export function computeCompletedStepIds(input: {
  hasDna: boolean;
  hasProfile: boolean;
  connectedCount: number;
  toolchainMappingConfirmed: boolean;
  jiraCalibrationComplete?: boolean;
  jiraConnected?: boolean;
  workflowConfigured: boolean;
  hasAssessedRelease: boolean;
  hasPendingApprovals: boolean;
  hasDeployedRelease: boolean;
  hasOpenIncident: boolean;
  hasObservabilitySynced?: boolean;
  /** @deprecated use hasObservabilitySynced */
  hasPrometheusSynced?: boolean;
}): string[] {
  const observabilitySynced =
    input.hasObservabilitySynced ?? input.hasPrometheusSynced ?? false;
  const done: string[] = ["auth"];

  if (input.hasDna && input.hasProfile) done.push("discovery");
  if (input.connectedCount >= 1) done.push("integrations");
  if (input.toolchainMappingConfirmed) done.push("toolchain-mapping");
  if (!input.jiraConnected || input.jiraCalibrationComplete) {
    done.push("jira-calibration");
  }
  if (input.workflowConfigured) done.push("workflow-config");
  if (input.hasAssessedRelease) done.push("qa-init");
  if (observabilitySynced) done.push("telemetry");
  if (input.hasAssessedRelease) {
    done.push("correlation", "recommendations");
  }
  if (input.hasAssessedRelease && !input.hasPendingApprovals) done.push("approval");
  if (input.hasDeployedRelease) done.push("execution");
  if (input.hasDeployedRelease && (observabilitySynced || !input.hasOpenIncident))
    done.push("monitoring");

  return [...new Set(done)];
}

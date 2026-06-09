import type { Integration } from "@/generated/prisma/client";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import { isPrometheusTrulyConnected } from "@/lib/prometheus-meta";
import { isGrafanaTrulyConnected } from "@/lib/grafana-meta";

export type IntegrationGateKey = "codeAnalysis" | "deliveryAnalysis" | "observability";

export type IntegrationNavGates = Record<IntegrationGateKey, boolean>;

export const INTEGRATION_GATE_PATHS: Record<string, IntegrationGateKey> = {
  "/code-analysis": "codeAnalysis",
  "/delivery-analysis": "deliveryAnalysis",
  "/observability": "observability",
};

export const DEFAULT_INTEGRATION_NAV_GATES: IntegrationNavGates = {
  codeAnalysis: false,
  deliveryAnalysis: false,
  observability: false,
};

export function getIntegrationNavGates(integrations: Integration[]): IntegrationNavGates {
  const github = integrations.find((i) => i.provider === "GITHUB" && i.status === "CONNECTED");
  const jira = integrations.find((i) => i.provider === "JIRA" && isJiraOAuthConnected(i));
  const prometheus = integrations.find((i) => i.provider === "PROMETHEUS");
  const grafana = integrations.find((i) => i.provider === "GRAFANA");

  const githubMeta = github ? parseIntegrationMeta(github.metadataJson) : null;
  const jiraMeta = jira ? parseJiraMeta(jira.metadataJson) : null;

  return {
    codeAnalysis: Boolean(githubMeta?.repoFullNames?.length),
    deliveryAnalysis: Boolean(jiraMeta?.projectKeys?.length),
    observability:
      isPrometheusTrulyConnected(prometheus) || isGrafanaTrulyConnected(grafana),
  };
}

export function getIntegrationGateForPath(pathname: string): IntegrationGateKey | null {
  for (const [prefix, gate] of Object.entries(INTEGRATION_GATE_PATHS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return gate;
    }
  }
  return null;
}

export function isIntegrationGatedPathAccessible(
  pathname: string,
  gates: IntegrationNavGates,
): boolean {
  const gate = getIntegrationGateForPath(pathname);
  if (!gate) return true;
  return gates[gate];
}

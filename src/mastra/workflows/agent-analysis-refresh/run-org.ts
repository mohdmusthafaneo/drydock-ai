import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";

import { ORGANIZATION_ID_KEY } from "@/mastra/config/request-context";
import { createLogger } from "@/lib/logger";
import {
  listAgentAnalysisOrganizationIds,
  resolveOrgAgentTargets,
  type OrgAgentTargets,
} from "./resolve-targets";

const log = createLogger({ component: "mastra/agent-analysis-refresh" });

export type AgentDomain = "qa" | "devops" | "productivity" | "governance";

export type DomainRunResult = {
  domain: AgentDomain;
  status: "ok" | "skipped" | "failed";
  reason?: string;
  error?: string;
  textPreview?: string;
};

export type OrgRunResult = {
  organizationId: string;
  domains: DomainRunResult[];
};

const AGENT_KEYS = {
  qa: "qaAgent",
  devops: "devopsAgent",
  productivity: "productivityAgent",
  governance: "governanceAgent",
} as const;

function buildPrompt(domain: AgentDomain, targets: OrgAgentTargets): string | null {
  switch (domain) {
    case "qa": {
      if (!targets.qa) return null;
      return [
        "Scheduled QA board health refresh for AIDOS.",
        `organizationId=${targets.organizationId}`,
        `Analyze Jira projects: ${targets.qa.projectKeys.join(", ")}.`,
        "Run all four presets (open_bugs, blocked, open, done) with count then issues samples,",
        "persist via persistQAReportTool, verify via verifyQAReportTool, then return the required JSON.",
        "Do not ask clarifying questions — use the connected Jira integration.",
      ].join("\n");
    }
    case "devops": {
      if (!targets.devops) return null;
      return [
        "Scheduled AWS account hygiene refresh for AIDOS.",
        `organizationId=${targets.organizationId}`,
        "Use the organization's stored AWS integration credentials (do not ask for role_arn/external_id).",
        "Call persistDevOpsAccountScanTool, then verifyDevOpsAccountScanTool, then return the required JSON.",
      ].join("\n");
    }
    case "productivity": {
      if (!targets.productivity) return null;
      return [
        "Scheduled engineering productivity refresh for AIDOS.",
        `organizationId=${targets.organizationId}`,
        `Repository: ${targets.productivity.repoUrl}`,
        `Branch: ${targets.productivity.branch}`,
        "Clone if needed, run analyze-git, persist via persistProductivityReportTool,",
        "verify via verifyProductivityReportTool, then return the required JSON.",
        "Do not ask clarifying questions.",
      ].join("\n");
    }
    case "governance": {
      if (!targets.governance) return null;
      return [
        "Scheduled code-change risk / governance refresh for AIDOS.",
        `organizationId=${targets.organizationId}`,
        `Repository: ${targets.governance.repoUrl}`,
        `Branch: ${targets.governance.branch}`,
        `Revspec for risk: ${targets.governance.revspec}`,
        "Clone, index with repowise, gather risk/health/dead-code, persist via persistGovernanceReportTool,",
        "verify via verifyGovernanceReportTool, then return the required JSON.",
        "Do not ask clarifying questions.",
      ].join("\n");
    }
    default:
      return null;
  }
}

async function runDomainAgent(
  mastra: Mastra,
  targets: OrgAgentTargets,
  domain: AgentDomain,
): Promise<DomainRunResult> {
  const prompt = buildPrompt(domain, targets);
  if (!prompt) {
    return {
      domain,
      status: "skipped",
      reason: "integration or selection missing",
    };
  }

  const agentKey = AGENT_KEYS[domain];
  const agent = mastra.getAgent(agentKey);
  const requestContext = new RequestContext();
  requestContext.set(ORGANIZATION_ID_KEY, targets.organizationId);
  requestContext.set("organizationId", targets.organizationId);

  try {
    const result = await agent.generate(prompt, {
      requestContext,
      maxSteps: 48,
    });
    const text = typeof result.text === "string" ? result.text : "";
    return {
      domain,
      status: "ok",
      textPreview: text.slice(0, 240),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(
      { organizationId: targets.organizationId, domain, err: message },
      "domain agent refresh failed",
    );
    return { domain, status: "failed", error: message };
  }
}

export async function runAgentAnalysisForOrg(
  mastra: Mastra,
  organizationId: string,
): Promise<OrgRunResult> {
  const targets = await resolveOrgAgentTargets(organizationId);
  const domains: AgentDomain[] = ["qa", "devops", "productivity", "governance"];
  const results: DomainRunResult[] = [];

  // Sequential per org — AWS scans and git clones are heavy.
  for (const domain of domains) {
    const result = await runDomainAgent(mastra, targets, domain);
    results.push(result);
    log.info(
      { organizationId, domain, status: result.status, reason: result.reason },
      "agent analysis domain complete",
    );
  }

  return { organizationId, domains: results };
}

export async function runAgentAnalysisRefresh(
  mastra: Mastra,
  input?: { organizationId?: string },
): Promise<{
  attempted: number;
  results: OrgRunResult[];
}> {
  const organizationIds = await listAgentAnalysisOrganizationIds(
    input?.organizationId,
  );
  const results: OrgRunResult[] = [];

  for (const organizationId of organizationIds) {
    try {
      results.push(await runAgentAnalysisForOrg(mastra, organizationId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ organizationId, err: message }, "org agent analysis failed");
      results.push({
        organizationId,
        domains: [
          {
            domain: "qa",
            status: "failed",
            error: message,
          },
        ],
      });
    }
  }

  return { attempted: organizationIds.length, results };
}

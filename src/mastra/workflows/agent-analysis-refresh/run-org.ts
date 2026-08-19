import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";

import { ORGANIZATION_ID_KEY } from "@/mastra/config/request-context";
import { createLogger } from "@/lib/logger";
import {
  listAgentAnalysisOrganizationIds,
  resolveOrgAgentTargets,
  type OrgAgentTargets,
  type RepoTarget,
} from "./resolve-targets";

const log = createLogger({ component: "mastra/agent-analysis-refresh" });

export type AgentDomain = "qa" | "devops" | "productivity" | "governance";

export type RepoRunResult = {
  repository: string;
  status: "ok" | "failed";
  error?: string;
  textPreview?: string;
};

export type DomainRunResult = {
  domain: AgentDomain;
  status: "ok" | "skipped" | "failed";
  reason?: string;
  error?: string;
  textPreview?: string;
  repository?: string;
  repoResults?: RepoRunResult[];
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

function buildPrompt(
  domain: AgentDomain,
  targets: OrgAgentTargets,
  repo?: RepoTarget,
): string | null {
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
      if (!repo) return null;
      return [
        "Scheduled engineering productivity refresh for AIDOS.",
        `organizationId=${targets.organizationId}`,
        `Repository: ${repo.repoUrl}`,
        `Branch: ${repo.branch}`,
        "Clone if needed, run analyze-git, persist via persistProductivityReportTool,",
        "verify via verifyProductivityReportTool, then return the required JSON.",
        "Do not ask clarifying questions.",
      ].join("\n");
    }
    case "governance": {
      if (!repo || !targets.governance) return null;
      return [
        "Scheduled code-change risk / governance refresh for AIDOS.",
        `organizationId=${targets.organizationId}`,
        `Repository: ${repo.repoUrl}`,
        `Branch: ${repo.branch}`,
        `repository_name: ${repo.fullName}`,
        `Revspec for risk: ${targets.governance.revspec}`,
        "Clone, index with repowise, gather risk/health/dead-code, persist via persistGovernanceReportTool,",
        `passing repository_name=\"${repo.fullName}\" (owner/repo form),`,
        "verify via verifyGovernanceReportTool, then return the required JSON.",
        "Do not ask clarifying questions.",
      ].join("\n");
    }
    default:
      return null;
  }
}

async function generateForDomain(
  mastra: Mastra,
  organizationId: string,
  domain: AgentDomain,
  prompt: string,
): Promise<{ textPreview: string }> {
  const agentKey = AGENT_KEYS[domain];
  const agent = mastra.getAgent(agentKey);
  const requestContext = new RequestContext();
  requestContext.set(ORGANIZATION_ID_KEY, organizationId);
  requestContext.set("organizationId", organizationId);

  const result = await agent.generate(prompt, {
    requestContext,
    maxSteps: 48,
  });
  const text = typeof result.text === "string" ? result.text : "";
  return { textPreview: text.slice(0, 240) };
}

async function runRepoFanOut(
  mastra: Mastra,
  targets: OrgAgentTargets,
  domain: "productivity" | "governance",
  repos: RepoTarget[],
): Promise<DomainRunResult> {
  if (repos.length === 0) {
    return {
      domain,
      status: "skipped",
      reason: "integration or selection missing",
    };
  }

  const repoResults: RepoRunResult[] = [];

  for (const repo of repos) {
    const prompt = buildPrompt(domain, targets, repo);
    if (!prompt) {
      repoResults.push({
        repository: repo.fullName,
        status: "failed",
        error: "prompt build failed",
      });
      continue;
    }

    try {
      const { textPreview } = await generateForDomain(
        mastra,
        targets.organizationId,
        domain,
        prompt,
      );
      repoResults.push({
        repository: repo.fullName,
        status: "ok",
        textPreview,
      });
      log.info(
        {
          organizationId: targets.organizationId,
          domain,
          repository: repo.fullName,
          status: "ok",
        },
        "agent analysis repo complete",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(
        {
          organizationId: targets.organizationId,
          domain,
          repository: repo.fullName,
          err: message,
        },
        "domain agent refresh failed for repo",
      );
      repoResults.push({
        repository: repo.fullName,
        status: "failed",
        error: message,
      });
    }
  }

  const okCount = repoResults.filter((r) => r.status === "ok").length;
  const failedCount = repoResults.length - okCount;

  if (okCount === 0) {
    return {
      domain,
      status: "failed",
      error: `all ${failedCount} repo run(s) failed`,
      repoResults,
    };
  }

  return {
    domain,
    status: "ok",
    reason:
      failedCount > 0
        ? `${okCount} ok, ${failedCount} failed`
        : `${okCount} repo(s)`,
    textPreview: repoResults.find((r) => r.status === "ok")?.textPreview,
    repoResults,
  };
}

async function runDomainAgent(
  mastra: Mastra,
  targets: OrgAgentTargets,
  domain: AgentDomain,
): Promise<DomainRunResult> {
  if (domain === "productivity") {
    return runRepoFanOut(
      mastra,
      targets,
      "productivity",
      targets.productivity?.repos ?? [],
    );
  }
  if (domain === "governance") {
    return runRepoFanOut(
      mastra,
      targets,
      "governance",
      targets.governance?.repos ?? [],
    );
  }

  const prompt = buildPrompt(domain, targets);
  if (!prompt) {
    return {
      domain,
      status: "skipped",
      reason: "integration or selection missing",
    };
  }

  try {
    const { textPreview } = await generateForDomain(
      mastra,
      targets.organizationId,
      domain,
      prompt,
    );
    return {
      domain,
      status: "ok",
      textPreview,
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
  options?: { domains?: AgentDomain[] },
): Promise<OrgRunResult> {
  const targets = await resolveOrgAgentTargets(organizationId);
  const domains: AgentDomain[] =
    options?.domains ?? ["qa", "devops", "productivity", "governance"];
  const results: DomainRunResult[] = [];

  // Sequential per org — AWS scans and git clones are heavy.
  for (const domain of domains) {
    const result = await runDomainAgent(mastra, targets, domain);
    results.push(result);
    log.info(
      {
        organizationId,
        domain,
        status: result.status,
        reason: result.reason,
        repos: result.repoResults?.length,
      },
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

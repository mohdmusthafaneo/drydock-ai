import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  loadLatestDevOpsRun,
  loadLatestGovernanceRun,
  loadLatestProductivityRun,
  loadLatestQaRun,
} from "@/lib/agent-analysis/load-latest-runs";

import { getAidosToolContext } from "./context";

const STALE_MS = 24 * 60 * 60 * 1000;

function withFreshness<T extends { analyzedAt: string }>(
  run: T | null,
  domain: string,
  dashboardHref: string,
) {
  if (!run) {
    return {
      ok: true as const,
      found: false as const,
      domain,
      message: `No verified ${domain} analysis run yet. Check ${dashboardHref} or wait for the next agent refresh.`,
      dashboardHref,
    };
  }

  const ageMs = Date.now() - new Date(run.analyzedAt).getTime();
  const stale = !Number.isNaN(ageMs) && ageMs > STALE_MS;

  return {
    ok: true as const,
    found: true as const,
    domain,
    analyzedAt: run.analyzedAt,
    stale,
    dashboardHref,
    run,
  };
}

export const aidosGetQaAnalysisTool = createTool({
  id: "aidos_get_qa_analysis",
  description:
    "Get the latest verified QA agent analysis run: open bugs, blocked/open/done counts, and issue evidence. Does not trigger a new analysis.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const run = await loadLatestQaRun(organizationId);
    return withFreshness(run, "qa", "/qa");
  },
});

export const aidosGetDevOpsAnalysisTool = createTool({
  id: "aidos_get_devops_analysis",
  description:
    "Get the latest verified DevOps / AWS hygiene analysis run: findings by severity, top findings, and warnings. Does not trigger a new analysis.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const run = await loadLatestDevOpsRun(organizationId);
    return withFreshness(run, "devops", "/devops");
  },
});

export const aidosGetProductivityAnalysisTool = createTool({
  id: "aidos_get_productivity_analysis",
  description:
    "Get the latest verified productivity (git) analysis run: commits, contributors, weekly volume, and commit-type mix. Does not trigger a new analysis.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const run = await loadLatestProductivityRun(organizationId);
    return withFreshness(run, "productivity", "/productivity");
  },
});

export const aidosGetGovernanceAnalysisTool = createTool({
  id: "aidos_get_governance_analysis",
  description:
    "Get the latest verified governance / code-risk analysis run: risk score, worst files, risk drivers, and dead code. Does not trigger a new analysis.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const run = await loadLatestGovernanceRun(organizationId);
    return withFreshness(run, "governance", "/code-health");
  },
});

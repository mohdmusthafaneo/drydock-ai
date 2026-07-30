import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { runAgentAnalysisRefresh } from "./run-org";

const inputSchema = z.object({
  /** When set, only refresh this org; otherwise fan out to all orgs with Delivery DNA. */
  organizationId: z.string().optional(),
});

const domainResultSchema = z.object({
  domain: z.enum(["qa", "devops", "productivity", "governance"]),
  status: z.enum(["ok", "skipped", "failed"]),
  reason: z.string().optional(),
  error: z.string().optional(),
});

const outputSchema = z.object({
  attempted: z.number(),
  ok: z.number(),
  skipped: z.number(),
  failed: z.number(),
  results: z.array(
    z.object({
      organizationId: z.string(),
      domains: z.array(domainResultSchema),
    }),
  ),
});

function resolveCron(): string {
  return process.env.AGENT_ANALYSIS_CRON?.trim() || "0 */6 * * *";
}

function resolveTimezone(): string {
  return process.env.AGENT_ANALYSIS_TIMEZONE?.trim() || "UTC";
}

function scheduleEnabled(): boolean {
  return process.env.AGENT_ANALYSIS_SCHEDULE_ENABLED !== "false";
}

const refreshAllOrgsStep = createStep({
  id: "refresh-all-org-agents",
  description:
    "Run QA, DevOps, productivity, and governance agents for each org with Delivery DNA, using connected integration metadata.",
  inputSchema,
  outputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!mastra) {
      throw new Error("Mastra instance unavailable in agent-analysis-refresh workflow");
    }

    const { attempted, results } = await runAgentAnalysisRefresh(mastra, {
      organizationId: inputData.organizationId,
    });

    let ok = 0;
    let skipped = 0;
    let failed = 0;
    for (const org of results) {
      for (const domain of org.domains) {
        if (domain.status === "ok") ok += 1;
        else if (domain.status === "skipped") skipped += 1;
        else failed += 1;
      }
    }

    return {
      attempted,
      ok,
      skipped,
      failed,
      results: results.map((r) => ({
        organizationId: r.organizationId,
        domains: r.domains.map((d) => ({
          domain: d.domain,
          status: d.status,
          reason: d.reason,
          error: d.error,
        })),
      })),
    };
  },
});

/**
 * Cron-driven refresh of the four domain agents.
 * Requires a long-lived Mastra host (Studio or AIDOS worker importing Mastra).
 * Pause via Studio schedules or AGENT_ANALYSIS_SCHEDULE_ENABLED=false.
 */
export const agentAnalysisRefreshWorkflow = createWorkflow({
  id: "agent-analysis-refresh-workflow",
  description:
    "Scheduled refresh of QA / DevOps / productivity / governance agents so dashboards stay current.",
  inputSchema,
  outputSchema,
  ...(scheduleEnabled()
    ? {
        schedule: {
          cron: resolveCron(),
          timezone: resolveTimezone(),
          inputData: {},
          metadata: {
            purpose: "agent-analysis-dashboard-refresh",
          },
        },
      }
    : {}),
})
  .then(refreshAllOrgsStep)
  .commit();

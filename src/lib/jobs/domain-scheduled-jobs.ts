import type { PgBoss } from "pg-boss";

import { runScheduledCodeAnalysisEnrich } from "@/lib/code-analysis/scheduled-enrich";
import { runScheduledComplianceEval } from "@/lib/compliance/scheduled-eval";
import { runScheduledBriefingEnrich } from "@/lib/executive-briefing/scheduled-enrich";
import { runScheduledGrafanaSync } from "@/lib/grafana-scheduled-sync";
import { runScheduledJiraCalibration } from "@/lib/jira-calibration/scheduled";
import { runScheduledJiraSync } from "@/lib/jira-scheduled-sync";
import { createLogger } from "@/lib/logger";
import { runScheduledPredictionEval } from "@/lib/problem-prediction/scheduled-eval";
import { JOB_NAMES } from "./constants";
import { createScheduledJob } from "./job-queue";

const log = createLogger({ component: "jobs/domain-scheduled" });

type OrgScopedJobData = {
  organizationId?: string;
};

function orgSingletonKey(prefix: string) {
  return (data: OrgScopedJobData) =>
    data.organizationId ? `${prefix}:${data.organizationId}` : `${prefix}:all`;
}

async function logScheduledResult(
  job: string,
  result: {
    attempted: number;
    [key: string]: number | unknown;
  },
): Promise<void> {
  log.info({ job, ...result }, `${job} complete`);
}

export const jiraSyncJob = createScheduledJob<OrgScopedJobData>({
  name: JOB_NAMES.jiraSync,
  cron: "*/15 * * * *",
  cronEnvKey: "JIRA_SYNC_INTERVAL_SEC",
  singletonKey: orgSingletonKey("jira-sync"),
  handler: async (data) => {
    const result = await runScheduledJiraSync({
      organizationId: data.organizationId,
    });
    await logScheduledResult(JOB_NAMES.jiraSync, result);
  },
});

export const jiraCalibrateJob = createScheduledJob<OrgScopedJobData>({
  name: JOB_NAMES.jiraCalibrate,
  cron: "0 0 * * *",
  cronEnvKey: "JIRA_CALIBRATE_INTERVAL_SEC",
  singletonKey: orgSingletonKey("jira-calibrate"),
  handler: async (data) => {
    const result = await runScheduledJiraCalibration({
      organizationId: data.organizationId,
    });
    await logScheduledResult(JOB_NAMES.jiraCalibrate, result);
  },
});

export const codeAnalysisEnrichJob = createScheduledJob<OrgScopedJobData>({
  name: JOB_NAMES.codeAnalysisEnrich,
  cron: "*/15 * * * *",
  cronEnvKey: "CODE_ANALYSIS_ENRICH_INTERVAL_SEC",
  singletonKey: orgSingletonKey("code-analysis-enrich"),
  handler: async (data) => {
    const result = await runScheduledCodeAnalysisEnrich({
      organizationId: data.organizationId,
    });
    await logScheduledResult(JOB_NAMES.codeAnalysisEnrich, result);
  },
});

export const complianceEvalJob = createScheduledJob<OrgScopedJobData>({
  name: JOB_NAMES.complianceEval,
  cron: "*/30 * * * *",
  cronEnvKey: "COMPLIANCE_EVAL_INTERVAL_SEC",
  singletonKey: orgSingletonKey("compliance-eval"),
  handler: async (data) => {
    const result = await runScheduledComplianceEval({
      organizationId: data.organizationId,
    });
    await logScheduledResult(JOB_NAMES.complianceEval, result);
  },
});

export const executiveBriefingEnrichJob = createScheduledJob<OrgScopedJobData>({
  name: JOB_NAMES.executiveBriefingEnrich,
  cron: "0 */2 * * *",
  cronEnvKey: "EXECUTIVE_BRIEFING_ENRICH_INTERVAL_SEC",
  singletonKey: orgSingletonKey("executive-briefing-enrich"),
  handler: async (data) => {
    const result = await runScheduledBriefingEnrich({
      organizationId: data.organizationId,
    });
    await logScheduledResult(JOB_NAMES.executiveBriefingEnrich, result);
  },
});

export const predictionsEvalJob = createScheduledJob<OrgScopedJobData>({
  name: JOB_NAMES.predictionsEval,
  cron: "0 * * * *",
  cronEnvKey: "PREDICTIONS_EVAL_INTERVAL_SEC",
  singletonKey: orgSingletonKey("predictions-eval"),
  handler: async (data) => {
    const result = await runScheduledPredictionEval({
      organizationId: data.organizationId,
    });
    await logScheduledResult(JOB_NAMES.predictionsEval, result);
  },
});

export const grafanaSyncJob = createScheduledJob<OrgScopedJobData>({
  name: JOB_NAMES.grafanaSync,
  cron: "*/15 * * * *",
  singletonKey: orgSingletonKey("grafana-sync"),
  handler: async (data) => {
    const result = await runScheduledGrafanaSync({
      organizationId: data.organizationId,
    });
    await logScheduledResult(JOB_NAMES.grafanaSync, result);
  },
});

const ALL_DOMAIN_JOBS = [
  jiraSyncJob,
  jiraCalibrateJob,
  codeAnalysisEnrichJob,
  complianceEvalJob,
  executiveBriefingEnrichJob,
  predictionsEvalJob,
  grafanaSyncJob,
] as const;

export async function ensureAllDomainSchedules(boss: PgBoss): Promise<void> {
  for (const job of ALL_DOMAIN_JOBS) {
    await job.ensureSchedule(boss);
  }
}

export async function registerAllDomainWorkers(boss: PgBoss): Promise<void> {
  for (const job of ALL_DOMAIN_JOBS) {
    await job.registerWorker(boss);
  }
}

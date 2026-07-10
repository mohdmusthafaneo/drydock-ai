import type { PgBoss } from "pg-boss";

import { prisma } from "@/lib/prisma";
import { enrichCodeAnalysisForOrg } from "@/lib/code-analysis/enrich";
import { isCodeAnalysisEnrichEnabled } from "@/lib/code-analysis/enrich-config";
import { evaluateCompliance } from "@/lib/compliance/evaluate";
import { enrichExecutiveBriefingForOrg } from "@/lib/executive-briefing/enrich-briefing";
import { runScheduledJiraCalibration } from "@/lib/jira-calibration/scheduled";
import { parseJiraMeta } from "@/lib/jira-meta";
import { createLogger } from "@/lib/logger";
import { evaluateProblemPredictions } from "@/lib/problem-prediction/persist";
import { JOB_NAMES } from "./constants";
import { createOrgFanoutJobs } from "./org-fanout";

const log = createLogger({ component: "jobs/domain-fanout" });

async function listOrgIdsFromCodeAnalysisRuns(): Promise<string[]> {
  const rows = await prisma.codeAnalysisRun.findMany({
    distinct: ["organizationId"],
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  return rows.map((row) => row.organizationId);
}

async function listOrgIdsForPredictionEval(): Promise<string[]> {
  const [delivery, code, compliance, telemetry, deploy, incident] =
    await Promise.all([
      prisma.deliveryAnalysisSnapshot.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
      }),
      prisma.codeAnalysisRun.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
      }),
      prisma.complianceFinding.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
      }),
      prisma.telemetryMetric.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
      }),
      prisma.deploymentEvent.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
      }),
      prisma.incident.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
      }),
    ]);

  return [
    ...new Set([
      ...delivery.map((r) => r.organizationId),
      ...code.map((r) => r.organizationId),
      ...compliance.map((r) => r.organizationId),
      ...telemetry.map((r) => r.organizationId),
      ...deploy.map((r) => r.organizationId),
      ...incident.map((r) => r.organizationId),
    ]),
  ].sort();
}

async function listJiraCalibrationOrgIds(): Promise<string[]> {
  const integrations = await prisma.integration.findMany({
    where: { provider: "JIRA", status: "CONNECTED" },
    select: { organizationId: true, metadataJson: true },
    orderBy: { organizationId: "asc" },
  });

  return integrations
    .filter((integration) => {
      const meta = parseJiraMeta(integration.metadataJson);
      return Boolean(meta.projectKeys?.length);
    })
    .map((integration) => integration.organizationId);
}

export const codeAnalysisEnrichFanout = createOrgFanoutJobs({
  fanoutName: JOB_NAMES.codeAnalysisEnrich,
  orgJobName: `${JOB_NAMES.codeAnalysisEnrich}.org`,
  cron: "*/15 * * * *",
  cronEnvKey: "CODE_ANALYSIS_ENRICH_INTERVAL_SEC",
  singletonPrefix: "code-analysis-enrich",
  listOrganizationIds: listOrgIdsFromCodeAnalysisRuns,
  runForOrganization: async (organizationId) => {
    if (!isCodeAnalysisEnrichEnabled()) {
      log.debug({ organizationId }, "code-analysis enrich disabled");
      return;
    }
    const result = await enrichCodeAnalysisForOrg(organizationId);
    log.info({ organizationId, status: result.status }, "code-analysis.enrich.org complete");
  },
});

export const complianceEvalFanout = createOrgFanoutJobs({
  fanoutName: JOB_NAMES.complianceEval,
  orgJobName: `${JOB_NAMES.complianceEval}.org`,
  cron: "*/30 * * * *",
  cronEnvKey: "COMPLIANCE_EVAL_INTERVAL_SEC",
  singletonPrefix: "compliance-eval",
  listOrganizationIds: listOrgIdsFromCodeAnalysisRuns,
  runForOrganization: async (organizationId) => {
    const sync = await evaluateCompliance(organizationId, "sync");
    const enrich = await evaluateCompliance(organizationId, "enrich");
    log.info(
      { organizationId, sync: sync.status, enrich: enrich.status },
      "compliance.eval.org complete",
    );
  },
});

export const executiveBriefingEnrichFanout = createOrgFanoutJobs({
  fanoutName: JOB_NAMES.executiveBriefingEnrich,
  orgJobName: `${JOB_NAMES.executiveBriefingEnrich}.org`,
  cron: "0 */2 * * *",
  cronEnvKey: "EXECUTIVE_BRIEFING_ENRICH_INTERVAL_SEC",
  singletonPrefix: "executive-briefing-enrich",
  listOrganizationIds: async () => {
    const rows = await prisma.deliveryDNA.findMany({
      select: { organizationId: true },
      orderBy: { organizationId: "asc" },
    });
    return rows.map((row) => row.organizationId);
  },
  runForOrganization: async (organizationId) => {
    const result = await enrichExecutiveBriefingForOrg(organizationId);
    log.info({ organizationId, status: result.status }, "executive-briefing.enrich.org complete");
  },
});

export const predictionsEvalFanout = createOrgFanoutJobs({
  fanoutName: JOB_NAMES.predictionsEval,
  orgJobName: `${JOB_NAMES.predictionsEval}.org`,
  cron: "0 * * * *",
  cronEnvKey: "PREDICTIONS_EVAL_INTERVAL_SEC",
  singletonPrefix: "predictions-eval",
  listOrganizationIds: listOrgIdsForPredictionEval,
  runForOrganization: async (organizationId) => {
    const result = await evaluateProblemPredictions(organizationId);
    log.info({ organizationId, status: result.status }, "predictions.eval.org complete");
  },
});

export const jiraCalibrateFanout = createOrgFanoutJobs({
  fanoutName: JOB_NAMES.jiraCalibrate,
  orgJobName: `${JOB_NAMES.jiraCalibrate}.org`,
  cron: "0 0 * * *",
  cronEnvKey: "JIRA_CALIBRATE_INTERVAL_SEC",
  singletonPrefix: "jira-calibrate",
  listOrganizationIds: listJiraCalibrationOrgIds,
  runForOrganization: async (organizationId) => {
    const result = await runScheduledJiraCalibration({ organizationId });
    log.info({ organizationId, ...result }, "jira.calibrate.org complete");
  },
});

const ALL_DOMAIN_FANOUT_JOBS = [
  codeAnalysisEnrichFanout,
  complianceEvalFanout,
  executiveBriefingEnrichFanout,
  predictionsEvalFanout,
  jiraCalibrateFanout,
] as const;

export async function ensureAllDomainFanoutSchedules(boss: PgBoss): Promise<void> {
  for (const job of ALL_DOMAIN_FANOUT_JOBS) {
    await job.ensureSchedule(boss);
  }
}

export async function registerAllDomainFanoutWorkers(boss: PgBoss): Promise<void> {
  for (const job of ALL_DOMAIN_FANOUT_JOBS) {
    await job.registerWorker(boss);
  }
}

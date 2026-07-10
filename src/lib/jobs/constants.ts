export const PGBOSS_SCHEMA = "pgboss";

/** pg-boss job names — see `domain-scheduled-jobs.ts` and `refresh-fanout-job.ts`. */
export const JOB_NAMES = {
  grafanaSync: "grafana.sync",
  jiraSync: "jira.sync",
  jiraCalibrate: "jira.calibrate",
  codeAnalysisEnrich: "code-analysis.enrich",
  complianceEval: "compliance.eval",
  executiveBriefingEnrich: "executive-briefing.enrich",
  predictionsEval: "predictions.eval",
  refreshFanout: "refresh.fanout",
  refreshOrg: "refresh.org",
  agentWakeup: "agent.wakeup",
  agentTimerScan: "agent.timer-scan",
} as const;

/** Integration providers handled by refresh.fanout → refresh.org (Phase 2). */
export const REFRESH_PROVIDERS = ["JIRA", "GRAFANA", "PROMETHEUS"] as const;
export type RefreshProvider = (typeof REFRESH_PROVIDERS)[number];

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

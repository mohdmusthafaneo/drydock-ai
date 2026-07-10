export const PGBOSS_SCHEMA = "pgboss";

/**
 * pg-boss job names registered in Phase 1c.
 * Jira/GitHub/Prometheus and other scheduled work still use HTTP cron routes
 * (`POST /api/cron/*`) until Phase 2 migrates them onto pg-boss.
 */
export const JOB_NAMES = {
  grafanaSync: "grafana.sync",
  agentWakeup: "agent.wakeup",
  agentTimerScan: "agent.timer-scan",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const PGBOSS_SCHEMA = "pgboss";

export const JOB_NAMES = {
  grafanaSync: "grafana.sync",
  agentWakeup: "agent.wakeup",
  agentTimerScan: "agent.timer-scan",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

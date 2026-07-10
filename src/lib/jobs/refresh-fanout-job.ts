import { prisma } from "@/lib/prisma";
import { runScheduledGrafanaSync } from "@/lib/grafana-scheduled-sync";
import { runScheduledJiraSync } from "@/lib/jira-scheduled-sync";
import { createLogger } from "@/lib/logger";
import { runPrometheusSyncForOrg } from "@/lib/prometheus-scheduled-sync";
import {
  JOB_NAMES,
  REFRESH_PROVIDERS,
  type RefreshProvider,
} from "./constants";
import { createTargetFanoutJobs } from "./org-fanout";

const log = createLogger({ component: "jobs/refresh-fanout" });

export type RefreshOrgJobData = {
  organizationId: string;
  provider: RefreshProvider;
};

async function listRefreshTargets(): Promise<RefreshOrgJobData[]> {
  const integrations = await prisma.integration.findMany({
    where: {
      provider: { in: [...REFRESH_PROVIDERS] },
      status: "CONNECTED",
    },
    select: { organizationId: true, provider: true },
    orderBy: [{ organizationId: "asc" }, { provider: "asc" }],
  });

  return integrations
    .filter((row): row is RefreshOrgJobData =>
      REFRESH_PROVIDERS.includes(row.provider as RefreshProvider),
    )
    .map((row) => ({
      organizationId: row.organizationId,
      provider: row.provider as RefreshProvider,
    }));
}

export async function runRefreshForOrg(
  target: RefreshOrgJobData,
): Promise<void> {
  const { organizationId, provider } = target;

  if (provider === "JIRA") {
    const result = await runScheduledJiraSync({ organizationId });
    log.info({ organizationId, provider, ...result }, "refresh.org jira complete");
    return;
  }

  if (provider === "GRAFANA") {
    const result = await runScheduledGrafanaSync({ organizationId });
    log.info({ organizationId, provider, ...result }, "refresh.org grafana complete");
    return;
  }

  if (provider === "PROMETHEUS") {
    const result = await runPrometheusSyncForOrg(organizationId);
    log.info({ organizationId, provider, status: result.status }, "refresh.org prometheus complete");
    return;
  }
}

export const refreshFanoutJobs = createTargetFanoutJobs<RefreshOrgJobData>({
  fanoutName: JOB_NAMES.refreshFanout,
  targetJobName: JOB_NAMES.refreshOrg,
  cron: "*/15 * * * *",
  cronEnvKey: "REFRESH_FANOUT_INTERVAL_SEC",
  singletonKey: (target) =>
    `refresh:${target.organizationId}:${target.provider}`,
  listTargets: listRefreshTargets,
  runForTarget: runRefreshForOrg,
  targetConcurrency: 5,
});

export async function enqueueIntegrationRefresh(input: {
  provider: RefreshProvider;
  organizationId?: string;
}): Promise<string | null> {
  if (input.organizationId) {
    return refreshFanoutJobs.sendTargetJob({
      organizationId: input.organizationId,
      provider: input.provider,
    });
  }
  return refreshFanoutJobs.sendFanoutJob();
}

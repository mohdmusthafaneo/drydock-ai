import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { enqueueIntegrationRefresh } from "@/lib/jobs/refresh-fanout-job";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.grafanaSync,
  enqueue: (input) =>
    enqueueIntegrationRefresh({
      provider: "GRAFANA",
      organizationId: input.organizationId,
    }),
});

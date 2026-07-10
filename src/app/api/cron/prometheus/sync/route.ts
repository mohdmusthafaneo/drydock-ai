import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { enqueueIntegrationRefresh } from "@/lib/jobs/refresh-fanout-job";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.refreshOrg,
  enqueue: (input) =>
    enqueueIntegrationRefresh({
      provider: "PROMETHEUS",
      organizationId: input.organizationId,
    }),
});

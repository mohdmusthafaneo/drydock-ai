import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { executiveBriefingEnrichFanout } from "@/lib/jobs/domain-fanout-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.executiveBriefingEnrich,
  enqueue: async (input) => {
    if (input.organizationId) {
      return executiveBriefingEnrichFanout.sendOrgJob(input.organizationId);
    }
    return executiveBriefingEnrichFanout.sendFanoutJob();
  },
});

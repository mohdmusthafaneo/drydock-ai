import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { codeAnalysisEnrichFanout } from "@/lib/jobs/domain-fanout-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.codeAnalysisEnrich,
  enqueue: async (input) => {
    if (input.organizationId) {
      return codeAnalysisEnrichFanout.sendOrgJob(input.organizationId);
    }
    return codeAnalysisEnrichFanout.sendFanoutJob();
  },
});

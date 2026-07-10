import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { complianceEvalFanout } from "@/lib/jobs/domain-fanout-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.complianceEval,
  enqueue: async (input) => {
    if (input.organizationId) {
      return complianceEvalFanout.sendOrgJob(input.organizationId);
    }
    return complianceEvalFanout.sendFanoutJob();
  },
});

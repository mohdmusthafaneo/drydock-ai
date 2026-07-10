import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { predictionsEvalFanout } from "@/lib/jobs/domain-fanout-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.predictionsEval,
  enqueue: async (input) => {
    if (input.organizationId) {
      return predictionsEvalFanout.sendOrgJob(input.organizationId);
    }
    return predictionsEvalFanout.sendFanoutJob();
  },
});

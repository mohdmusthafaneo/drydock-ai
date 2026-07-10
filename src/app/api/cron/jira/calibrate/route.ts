import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { jiraCalibrateFanout } from "@/lib/jobs/domain-fanout-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.jiraCalibrate,
  enqueue: async (input) => {
    if (input.organizationId) {
      return jiraCalibrateFanout.sendOrgJob(input.organizationId);
    }
    return jiraCalibrateFanout.sendFanoutJob();
  },
});

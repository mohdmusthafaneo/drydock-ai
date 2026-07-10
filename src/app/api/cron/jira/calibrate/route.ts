import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { jiraCalibrateJob } from "@/lib/jobs/domain-scheduled-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.jiraCalibrate,
  enqueue: (input) => jiraCalibrateJob.sendJob(input),
});

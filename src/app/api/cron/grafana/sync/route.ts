import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { grafanaSyncJob } from "@/lib/jobs/domain-scheduled-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.grafanaSync,
  enqueue: (input) => grafanaSyncJob.sendJob(input),
});

import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { jiraSyncJob } from "@/lib/jobs/domain-scheduled-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.jiraSync,
  enqueue: (input) => jiraSyncJob.sendJob(input),
});

import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { executiveBriefingEnrichJob } from "@/lib/jobs/domain-scheduled-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.executiveBriefingEnrich,
  enqueue: (input) => executiveBriefingEnrichJob.sendJob(input),
});

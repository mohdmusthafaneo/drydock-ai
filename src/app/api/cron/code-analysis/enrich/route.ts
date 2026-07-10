import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { codeAnalysisEnrichJob } from "@/lib/jobs/domain-scheduled-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.codeAnalysisEnrich,
  enqueue: (input) => codeAnalysisEnrichJob.sendJob(input),
});

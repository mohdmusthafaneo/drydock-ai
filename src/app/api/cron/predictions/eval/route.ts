import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { predictionsEvalJob } from "@/lib/jobs/domain-scheduled-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.predictionsEval,
  enqueue: (input) => predictionsEvalJob.sendJob(input),
});

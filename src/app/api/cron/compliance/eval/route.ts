import { createCronEnqueueRoute } from "@/lib/jobs/cron-route";
import { complianceEvalJob } from "@/lib/jobs/domain-scheduled-jobs";
import { JOB_NAMES } from "@/lib/jobs/constants";

export const POST = createCronEnqueueRoute({
  jobName: JOB_NAMES.complianceEval,
  enqueue: (input) => complianceEvalJob.sendJob(input),
});

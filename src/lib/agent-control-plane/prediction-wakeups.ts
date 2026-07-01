import { enqueueSuperAgentEventWakeup } from "./delegation";

/** Wake Super Agent when prediction eval detects new critical predictions — Super delegates to Problem Predictor. */
export async function enqueuePredictionEvaluatedWakeups(
  organizationId: string,
  input: { newCritical: number; batchKey: string },
) {
  await enqueueSuperAgentEventWakeup(
    organizationId,
    "prediction.evaluated",
    {
      event: "prediction.evaluated",
      newCritical: input.newCritical,
      batchKey: input.batchKey,
    },
    `prediction:${input.batchKey}:evaluated`,
  );
}

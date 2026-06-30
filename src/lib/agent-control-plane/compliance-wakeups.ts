import { enqueueSuperAgentEventWakeup } from "./delegation";

/** Wake Super Agent when compliance eval detects new critical findings — Super delegates to Governance. */
export async function enqueueComplianceEvaluatedWakeups(
  organizationId: string,
  input: { newCritical: number; phase: string; batchKey: string },
) {
  await enqueueSuperAgentEventWakeup(
    organizationId,
    "compliance.evaluated",
    {
      event: "compliance.evaluated",
      newCritical: input.newCritical,
      phase: input.phase,
      batchKey: input.batchKey,
    },
    `compliance:${input.batchKey}:evaluated`,
  );
}

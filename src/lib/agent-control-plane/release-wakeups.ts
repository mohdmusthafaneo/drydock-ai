import { enqueueSuperAgentEventWakeup } from "./delegation";

/** Wake Super Agent when a release is detected — Super delegates to QA specialist. */
export async function enqueueReleaseDetectedWakeups(
  organizationId: string,
  releaseId: string,
) {
  await enqueueSuperAgentEventWakeup(
    organizationId,
    "release.detected",
    { releaseId, event: "release.detected" },
    `release:${releaseId}:detected`,
  );
}

/** Wake Super Agent after assessment — Super may delegate follow-up to Governance. */
export async function enqueueReleaseAssessedWakeups(
  organizationId: string,
  releaseId: string,
) {
  await enqueueSuperAgentEventWakeup(
    organizationId,
    "release.assessed",
    { releaseId, event: "release.assessed" },
    `release:${releaseId}:assessed`,
  );
}

import type { CalibrationSample } from "@/lib/jira-calibration/types";
import { LIFECYCLE_ISSUE_CAP } from "@/lib/delivery-analysis/lifecycle-compute";
import type { LifecycleIssueSampleStored } from "@/lib/delivery-analysis/lifecycle-types";
import { mergeJiraMeta, parseJiraMeta } from "@/lib/jira-meta";
import { prisma } from "@/lib/prisma";

/** Build a capped lifecycle sample from a calibration fetch. */
export function lifecycleSampleFromCalibration(
  sample: CalibrationSample,
): LifecycleIssueSampleStored {
  return {
    fetchedAt: sample.fetchedAt,
    projectKey: sample.projectKey,
    windowDays: sample.windowDays,
    capped: sample.capped || sample.issues.length > LIFECYCLE_ISSUE_CAP,
    issues: sample.issues.slice(0, LIFECYCLE_ISSUE_CAP).map((issue) => ({
      key: issue.key,
      summary: issue.summary,
      issueType: issue.issueType,
      status: issue.status,
      priority: issue.priority,
      created: issue.created,
      resolutionDate: issue.resolutionDate,
      labels: issue.labels,
      assignee: issue.assignee,
      dueDate: issue.dueDate,
      transitions: issue.transitions,
    })),
  };
}

/** Persist lifecycle issue sample on the org's Jira Integration metadata. */
export async function persistLifecycleIssueSample(input: {
  organizationId: string;
  sample: CalibrationSample;
}): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "JIRA",
      },
    },
    select: { id: true, metadataJson: true },
  });
  if (!integration) return;

  const lifecycleIssueSample = lifecycleSampleFromCalibration(input.sample);
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson: mergeJiraMeta(parseJiraMeta(integration.metadataJson), {
        lifecycleIssueSample,
      }),
    },
  });
}

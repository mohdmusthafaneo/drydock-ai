import { getMastra } from "@/mastra";
import { prisma } from "@/lib/prisma";
import { parseJiraMeta } from "@/lib/jira-meta";
import { analyzeCalibrationSample } from "@/lib/jira-calibration/analyze";
import { fetchJiraCalibrationSample } from "@/lib/jira-calibration/fetch-sample";
import {
  observationsToDeterministicProfile,
  upsertCalibrationProfile,
} from "@/lib/jira-calibration/persist";

export type RunJiraCalibrationResult =
  | { status: "calibrated"; projectKey: string; confidence: string }
  | { status: "needs_review"; projectKey: string; confidence: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; projectKey: string; error: string };

function buildFactsJson(input: {
  orgName: string;
  projectKey: string;
  observations: ReturnType<typeof analyzeCalibrationSample>;
}): string {
  return JSON.stringify(
    {
      orgName: input.orgName,
      projectKey: input.projectKey,
      windowDays: input.observations.windowDays,
      topTransitions: input.observations.transitions.slice(0, 15),
      doneStatusCandidates: input.observations.inferredDoneStatusNames,
      blockedStatus: input.observations.inferredBlockedStatusName,
      releaseEvidence: input.observations.releaseTrackingEvidence,
      hygieneBaselines: input.observations.hygieneBaselines,
      methodology: input.observations.methodology,
    },
    null,
    2,
  );
}

export async function runJiraCalibrationForProject(input: {
  organizationId: string;
  projectKey: string;
  windowDays?: number;
}): Promise<RunJiraCalibrationResult> {
  const { organizationId, projectKey } = input;

  const [org, profile, integration] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    prisma.organizationProfile.findUnique({ where: { organizationId } }),
    prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "JIRA" },
      },
    }),
  ]);

  if (!integration || integration.status !== "CONNECTED") {
    return { status: "skipped", reason: "jira_not_connected" };
  }

  await upsertCalibrationProfile({
    organizationId,
    projectKey,
    status: "calibrating",
    windowDays: input.windowDays ?? 90,
  });

  try {
    const sample = await fetchJiraCalibrationSample({
      organizationId,
      projectKey,
      windowDays: input.windowDays,
    });
    const observations = analyzeCalibrationSample(sample);

    await upsertCalibrationProfile({
      organizationId,
      projectKey,
      status: "calibrating",
      windowDays: sample.windowDays,
      observed: observations,
      confidence: observations.confidence,
      source: "deterministic",
    });

    const jiraMeta = parseJiraMeta(integration.metadataJson);
    const mappingJson = profile?.toolchainMappingJson ?? "{}";
    const factsJson = buildFactsJson({
      orgName: org?.name ?? "Organization",
      projectKey,
      observations,
    });

    let profileResult = observationsToDeterministicProfile(observations);
    let llmRationale: string | undefined;
    let source: "deterministic" | "llm_calibrated" = "deterministic";

    try {
      const mastra = await getMastra();
      const workflow = mastra.getWorkflow("jiraCalibrationWorkflow");
      const run = await workflow.createRun();
      const workflowResult = await run.start({
        inputData: {
          orgName: org?.name ?? "Organization",
          projectKey,
          observations,
          schemaSnapshotJson: jiraMeta.jiraSchemaSnapshot
            ? JSON.stringify(jiraMeta.jiraSchemaSnapshot)
            : undefined,
          workflowsJson: profile?.workflowsJson,
          mappingJson,
          factsJson,
        },
      });

      if (workflowResult.status === "success" && workflowResult.result?.profile) {
        profileResult = workflowResult.result.profile;
        llmRationale = workflowResult.result.rationale;
        source = workflowResult.result.enriched ? "llm_calibrated" : "deterministic";
      }
    } catch {
      profileResult = observationsToDeterministicProfile(observations);
    }

    const finalStatus =
      profileResult.confidence === "low" ? "needs_review" : "calibrated";

    await upsertCalibrationProfile({
      organizationId,
      projectKey,
      status: finalStatus,
      windowDays: sample.windowDays,
      observed: observations,
      profile: profileResult,
      llmRationale,
      confidence: profileResult.confidence,
      source,
    });

    await prisma.activityEvent.create({
      data: {
        organizationId,
        type: "jira.calibration.completed",
        title: `Jira workflow calibrated (${projectKey})`,
        description: `90-day calibration complete with ${profileResult.confidence} confidence`,
        metadataJson: JSON.stringify({
          projectKey,
          confidence: profileResult.confidence,
          doneStatusNames: profileResult.doneStatusNames,
          source,
        }),
      },
    });

    return {
      status: finalStatus,
      projectKey,
      confidence: profileResult.confidence,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calibration failed";
    await upsertCalibrationProfile({
      organizationId,
      projectKey,
      status: "failed",
      windowDays: input.windowDays ?? 90,
    });
    return { status: "failed", projectKey, error: message };
  }
}

/** Queue calibration for all synced project keys (fire-and-forget safe). */
export async function enqueueJiraCalibration(
  organizationId: string,
  projectKeys?: string[],
): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" },
    },
  });
  if (!integration || integration.status !== "CONNECTED") return;

  const keys =
    projectKeys ??
    parseJiraMeta(integration.metadataJson).projectKeys ??
    [];

  for (const projectKey of keys) {
    const existing = await prisma.jiraCalibrationProfile.findUnique({
      where: {
        organizationId_projectKey: { organizationId, projectKey },
      },
      select: { status: true },
    });
    if (existing?.status === "calibrated" || existing?.status === "calibrating") {
      continue;
    }
    void runJiraCalibrationForProject({ organizationId, projectKey });
  }
}

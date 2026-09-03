/**
 * Download GitHub Actions test-report artifacts and ingest JUnit XML.
 * Recommend-only — never writes back to GitHub.
 */

import {
  downloadArtifactArchive,
  listWorkflowRunArtifacts,
  type GitHubWorkflowRun,
} from "@/lib/github-api";
import { ingestJUnitReport } from "@/lib/drydock/ingest";
import { extractTextFilesFromZip, isJUnitXml } from "@/lib/drydock/unzip";
import type { CiRunConclusion } from "@/generated/prisma/client";

const MAX_ARTIFACTS_PER_RUN = 8;
const MAX_RUNS_TO_INGEST = 40;

function mapConclusion(value: string | null): CiRunConclusion {
  switch (value) {
    case "success":
      return "SUCCESS";
    case "failure":
      return "FAILURE";
    case "cancelled":
      return "CANCELLED";
    case "skipped":
      return "SKIPPED";
    case "neutral":
      return "NEUTRAL";
    default:
      return "UNKNOWN";
  }
}

function looksLikeTestArtifact(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("junit") ||
    lower.includes("test") ||
    lower.includes("playwright") ||
    lower.includes("allure") ||
    lower.includes("report") ||
    lower.includes("results")
  );
}

export type ArtifactIngestSummary = {
  runsInspected: number;
  artifactsDownloaded: number;
  reportsIngested: number;
  errors: string[];
};

export async function ingestWorkflowRunArtifacts(args: {
  organizationId: string;
  accessToken: string;
  owner: string;
  repo: string;
  repositoryFullName: string;
  runs: GitHubWorkflowRun[];
}): Promise<ArtifactIngestSummary> {
  const summary: ArtifactIngestSummary = {
    runsInspected: 0,
    artifactsDownloaded: 0,
    reportsIngested: 0,
    errors: [],
  };

  for (const run of args.runs.slice(0, MAX_RUNS_TO_INGEST)) {
    summary.runsInspected += 1;
    let artifacts;
    try {
      artifacts = await listWorkflowRunArtifacts(
        args.accessToken,
        args.owner,
        args.repo,
        run.id,
      );
    } catch (err) {
      summary.errors.push(
        `run ${run.id}: ${err instanceof Error ? err.message : "artifact list failed"}`,
      );
      continue;
    }

    const candidates = artifacts
      .filter((a) => !a.expired && looksLikeTestArtifact(a.name))
      .slice(0, MAX_ARTIFACTS_PER_RUN);

    for (const artifact of candidates) {
      try {
        const zip = await downloadArtifactArchive(
          args.accessToken,
          args.owner,
          args.repo,
          artifact.id,
        );
        summary.artifactsDownloaded += 1;
        const files = extractTextFilesFromZip(zip);
        const xmlFiles = files.filter((f) => isJUnitXml(f.content));
        if (xmlFiles.length === 0) continue;

        const combined =
          xmlFiles.length === 1
            ? xmlFiles[0]!.content
            : `<testsuites>\n${xmlFiles
                .map((f) =>
                  f.content.replace(/<\?xml[^?]*\?>/gi, "").trim(),
                )
                .join("\n")}\n</testsuites>`;
        await ingestJUnitReport({
          organizationId: args.organizationId,
          repository: args.repositoryFullName,
          workflowName: run.name,
          workflowRunId: String(run.id),
          commitSha: run.head_sha || "unknown",
          branch: run.head_branch || "unknown",
          conclusion: mapConclusion(run.conclusion),
          finishedAt: run.updated_at ? new Date(run.updated_at) : new Date(),
          htmlUrl: run.html_url,
          junitXml: combined,
        });
        summary.reportsIngested += 1;
      } catch (err) {
        summary.errors.push(
          `artifact ${artifact.name}: ${err instanceof Error ? err.message : "ingest failed"}`,
        );
      }
    }
  }

  return summary;
}

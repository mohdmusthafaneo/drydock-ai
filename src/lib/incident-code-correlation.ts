import { prisma } from "@/lib/prisma";

const CORRELATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const MAX_LINKS = 5;

export type IncidentCodeLinkView = {
  id: string;
  pullRequestExternalId: string | null;
  commitSha: string | null;
  confidence: number;
  reason: string;
  people: string[];
  pr?: {
    number: number;
    title: string;
    url: string;
    repo: string;
    author: string;
    reviewers: string[];
    mergedAt: string;
    attribution: string;
  };
};

function parsePeopleJson(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

function parseReviewersJson(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

function rollupPeople(author: string, reviewers: string[]): string[] {
  return [...new Set([author, ...reviewers].filter(Boolean))];
}

function repoMatchesService(repo: string, services: string[]): boolean {
  if (services.length === 0) return true;
  const repoName = repo.split("/").pop()?.toLowerCase() ?? "";
  return services.some((service) => {
    const normalized = service.toLowerCase();
    return (
      repoName.includes(normalized) ||
      normalized.includes(repoName) ||
      repo.toLowerCase().includes(normalized)
    );
  });
}

export async function correlateIncidentCodeChanges(input: {
  organizationId: string;
  incidentId: string;
}): Promise<IncidentCodeLinkView[]> {
  const incident = await prisma.incident.findFirst({
    where: { id: input.incidentId, organizationId: input.organizationId },
    include: { release: true },
  });

  if (!incident) return [];

  let services: string[] = [];
  try {
    services = JSON.parse(incident.affectedServicesJson || "[]") as string[];
  } catch {
    services = [];
  }

  const windowStart = new Date(incident.detectedAt.getTime() - CORRELATION_WINDOW_MS);

  const deployment = incident.releaseId
    ? await prisma.deploymentEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          releaseId: incident.releaseId,
        },
        orderBy: { deployedAt: "desc" },
      })
    : null;

  const mergedBefore = deployment?.deployedAt ?? incident.detectedAt;

  const candidatePrs = await prisma.codeAnalysisPullRequest.findMany({
    where: {
      organizationId: input.organizationId,
      mergedAt: {
        gte: windowStart,
        lte: mergedBefore,
      },
    },
    orderBy: { mergedAt: "desc" },
    take: 40,
  });

  const scored = candidatePrs
    .filter((pr) => repoMatchesService(pr.repo, services))
    .map((pr) => {
      const hoursBefore =
        (incident.detectedAt.getTime() - pr.mergedAt.getTime()) / (60 * 60 * 1000);
      let confidence = Math.max(0.2, 1 - hoursBefore / 72);
      let reason = `Merged ${Math.round(hoursBefore)}h before incident detection`;

      if (deployment?.pullRequestNumber === pr.number) {
        confidence = 0.95;
        reason = "Matched deploy anchor PR";
      } else if (
        deployment?.mergeCommitSha &&
        pr.externalId.endsWith(`#${deployment.pullRequestNumber ?? -1}`)
      ) {
        confidence = 0.9;
        reason = "Matched deploy merge anchor";
      }

      const reviewers = parseReviewersJson(pr.reviewersJson);
      const people = rollupPeople(pr.author, reviewers);

      return {
        pullRequestExternalId: pr.externalId,
        commitSha: null as string | null,
        confidence,
        reason,
        people,
        pr: {
          number: pr.number,
          title: pr.title,
          url: pr.url,
          repo: pr.repo,
          author: pr.author,
          reviewers,
          mergedAt: pr.mergedAt.toISOString(),
          attribution: pr.attribution,
        },
        mergedAt: pr.mergedAt,
      };
    })
    .sort((a, b) => b.confidence - a.confidence || b.mergedAt.getTime() - a.mergedAt.getTime())
    .slice(0, MAX_LINKS);

  await prisma.incidentCodeLink.deleteMany({
    where: { organizationId: input.organizationId, incidentId: incident.id },
  });

  if (scored.length > 0) {
    await prisma.incidentCodeLink.createMany({
      data: scored.map((item) => ({
        organizationId: input.organizationId,
        incidentId: incident.id,
        pullRequestExternalId: item.pullRequestExternalId,
        commitSha: item.commitSha,
        confidence: item.confidence,
        reason: item.reason,
        peopleJson: JSON.stringify(item.people),
      })),
    });
  }

  const stored = await prisma.incidentCodeLink.findMany({
    where: { organizationId: input.organizationId, incidentId: incident.id },
    orderBy: { confidence: "desc" },
  });

  const prByExternalId = new Map(candidatePrs.map((pr) => [pr.externalId, pr]));

  return stored.map((link) => {
    const prRow = link.pullRequestExternalId
      ? prByExternalId.get(link.pullRequestExternalId)
      : undefined;
    return {
      id: link.id,
      pullRequestExternalId: link.pullRequestExternalId,
      commitSha: link.commitSha,
      confidence: link.confidence,
      reason: link.reason,
      people: parsePeopleJson(link.peopleJson),
      pr: prRow
        ? {
            number: prRow.number,
            title: prRow.title,
            url: prRow.url,
            repo: prRow.repo,
            author: prRow.author,
            reviewers: parseReviewersJson(prRow.reviewersJson),
            mergedAt: prRow.mergedAt.toISOString(),
            attribution: prRow.attribution,
          }
        : undefined,
    };
  });
}

export async function resolveDeployAnchor(input: {
  organizationId: string;
  releaseId: string;
}): Promise<{ mergeCommitSha: string | null; pullRequestNumber: number | null }> {
  const recentPr = await prisma.codeAnalysisPullRequest.findFirst({
    where: {
      organizationId: input.organizationId,
      mergedAt: { lte: new Date() },
    },
    orderBy: { mergedAt: "desc" },
  });

  if (!recentPr) {
    return { mergeCommitSha: null, pullRequestNumber: null };
  }

  return {
    mergeCommitSha: null,
    pullRequestNumber: recentPr.number,
  };
}

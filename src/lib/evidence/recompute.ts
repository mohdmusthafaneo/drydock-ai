import { asSystem } from "@/lib/prisma";
import { getEmbeddingService } from "@/lib/ml/embedding-service";
import {
  cosineSimilarityFromDistance,
  parsePgVector,
  searchSimilarEmbeddings,
  upsertEmbedding,
} from "@/lib/ml/vector-store";
import { createLogger } from "@/lib/logger";
import { buildCommitEmbedText, buildTicketEmbedText } from "./buildText";
import { runEvidencePipeline } from "./pipeline";
import { redactSecrets } from "./redactSecrets";
import type { EvidenceCommit, EvidenceTicket } from "./types";

const log = createLogger({ component: "evidence/recompute" });

export type RecomputeEvidenceResult = {
  status: "completed" | "skipped";
  reason?: string;
  ticketCount?: number;
  commitCount?: number;
  linkCount?: number;
  directCount?: number;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Recompute evidence links for an org from persisted TicketSnapshot / CommitSnapshot rows.
 * Embeds via ML sidecar, stores vectors in pgvector, upserts EvidenceLink rows.
 */
export async function recomputeEvidenceForOrg(
  organizationId: string,
  options: { sprintId?: string | null } = {},
): Promise<RecomputeEvidenceResult> {
  const db = asSystem();

  const ticketRows = await db.ticketSnapshot.findMany({
    where: {
      organizationId,
      ...(options.sprintId ? { sprintId: options.sprintId } : {}),
    },
  });
  const commitRows = await db.commitSnapshot.findMany({
    where: { organizationId },
  });

  if (ticketRows.length === 0 || commitRows.length === 0) {
    return {
      status: "skipped",
      reason: "no_snapshots",
      ticketCount: ticketRows.length,
      commitCount: commitRows.length,
    };
  }

  const tickets: EvidenceTicket[] = ticketRows.map((row) => ({
    jiraKey: row.jiraKey,
    projectKey: row.projectKey,
    sprintId: row.sprintId,
    summary: row.summary,
    descriptionText: redactSecrets(row.descriptionText),
    assigneeName: row.assigneeName,
    reporterName: row.reporterName,
    status: row.status,
    issueType: row.issueType,
    priority: row.priority,
    labels: asStringArray(row.labelsJson),
    storyPoints: row.storyPoints,
    createdAt: row.ticketCreatedAt,
    updatedAt: row.ticketUpdatedAt,
    resolvedAt: row.resolvedAt,
  }));

  const commits: EvidenceCommit[] = commitRows.map((row) => ({
    sha: row.sha,
    repoFullName: row.repoFullName,
    primaryBranch: row.primaryBranch,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    commitDate: row.commitDate,
    subject: row.subject,
    body: row.body,
    filesTouched: asStringArray(row.filesTouchedJson),
    funcSignatures: asStringArray(row.funcSignaturesJson),
    hunkSnippet: row.hunkSnippet,
  }));

  const ticketIdByKey = new Map(ticketRows.map((r) => [r.jiraKey, r.id]));
  const commitIdBySha = new Map(
    commitRows.map((r) => [`${r.repoFullName}:${r.sha}`, r.id]),
  );

  const embedSvc = getEmbeddingService();

  // Persist embeddings for tickets + commits (batched).
  const ticketTexts = tickets.map(buildTicketEmbedText);
  const commitTexts = commits.map(buildCommitEmbedText);

  const BATCH = 32;
  for (let i = 0; i < ticketTexts.length; i += BATCH) {
    const slice = ticketTexts.slice(i, i + BATCH);
    const { vectors, model } = await embedSvc.embed(slice);
    for (let j = 0; j < slice.length; j++) {
      const ticket = tickets[i + j]!;
      const vector = vectors[j];
      if (!vector) continue;
      await upsertEmbedding({
        organizationId,
        refType: "ticket",
        refId: ticketIdByKey.get(ticket.jiraKey)!,
        modelName: model,
        vector,
      });
    }
  }

  for (let i = 0; i < commitTexts.length; i += BATCH) {
    const slice = commitTexts.slice(i, i + BATCH);
    const { vectors, model } = await embedSvc.embed(slice);
    for (let j = 0; j < slice.length; j++) {
      const commit = commits[i + j]!;
      const vector = vectors[j];
      if (!vector) continue;
      const snapId = commitIdBySha.get(`${commit.repoFullName}:${commit.sha}`)!;
      await upsertEmbedding({
        organizationId,
        refType: "commit",
        refId: snapId,
        modelName: model,
        vector,
      });
    }
  }

  const codeSimilarity = async (
    tTexts: string[],
    _cTexts: string[],
  ): Promise<number[][]> => {
    // Use pgvector NN per ticket against commit embeddings already stored.
    const matrix: number[][] = Array.from({ length: tTexts.length }, () =>
      Array.from({ length: commits.length }, () => 0),
    );

    for (let ti = 0; ti < tickets.length; ti++) {
      const ticket = tickets[ti]!;
      const ticketSnapId = ticketIdByKey.get(ticket.jiraKey);
      if (!ticketSnapId) continue;

      const embedRows = await db.$queryRaw<Array<{ vector: string }>>`
        SELECT "vector"::text AS "vector"
        FROM "Embedding"
        WHERE "organizationId" = ${organizationId}
          AND "refType" = 'ticket'::"EmbeddingRefType"
          AND "refId" = ${ticketSnapId}
        LIMIT 1
      `;
      const raw = embedRows[0]?.vector;
      if (!raw) continue;

      const queryVector = parsePgVector(raw);
      const neighbors = await searchSimilarEmbeddings({
        organizationId,
        queryVector,
        refType: "commit",
        limit: Math.min(32, commits.length),
      });

      const commitIndex = new Map(
        commits.map((c, idx) => [
          commitIdBySha.get(`${c.repoFullName}:${c.sha}`),
          idx,
        ]),
      );

      for (const neighbor of neighbors) {
        const ci = commitIndex.get(neighbor.refId);
        if (ci == null || neighbor.distance == null) continue;
        matrix[ti]![ci] = cosineSimilarityFromDistance(neighbor.distance);
      }
    }

    return matrix;
  };

  const result = await runEvidencePipeline({
    tickets,
    commits,
    codeSimilarity,
    topKPerTicket: 8,
  });

  // Replace links for these tickets (idempotent recompute).
  const ticketSnapIds = ticketRows.map((r) => r.id);
  await db.evidenceLink.deleteMany({
    where: {
      organizationId,
      ticketSnapshotId: { in: ticketSnapIds },
    },
  });

  for (const candidate of result.candidates) {
    const ticketSnapshotId = ticketIdByKey.get(candidate.ticketKey);
    const commitSnapshotId = commitIdBySha.get(
      `${candidate.repoFullName}:${candidate.commitSha}`,
    );
    if (!ticketSnapshotId || !commitSnapshotId) continue;

    await db.evidenceLink.create({
      data: {
        organizationId,
        ticketSnapshotId,
        commitSnapshotId,
        sprintId: options.sprintId ?? ticketRows.find((t) => t.id === ticketSnapshotId)?.sprintId,
        tier: candidate.tier,
        authorScore: candidate.scores.authorScore,
        dateScore: candidate.scores.dateScore,
        keywordScore: candidate.scores.keywordScore,
        codeSimScore: candidate.scores.codeSimScore,
        compositeScore: candidate.compositeScore,
        signalPattern: candidate.signalPattern,
      },
    });
  }

  log.info(
    {
      organizationId,
      ticketCount: result.ticketCount,
      commitCount: result.commitCount,
      linkCount: result.candidates.length,
      directCount: result.directCount,
    },
    "evidence.recompute complete",
  );

  return {
    status: "completed",
    ticketCount: result.ticketCount,
    commitCount: result.commitCount,
    linkCount: result.candidates.length,
    directCount: result.directCount,
  };
}

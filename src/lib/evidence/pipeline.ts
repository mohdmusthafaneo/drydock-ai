import { buildCommitEmbedText, buildTicketEmbedText } from "./buildText";
import { dateSignalScore } from "./dateSignal";
import { keywordSignalScore } from "./keywordSignal";
import {
  assignTier,
  compositeMultiSignal,
  finalComposite,
  hasDirectKeyMatch,
  keepCandidate,
  signalPattern,
} from "./matchScore";
import { nameMatchScore } from "./nameMatch";
import type {
  EvidenceCandidate,
  EvidenceCommit,
  EvidenceTicket,
  PipelineResult,
  SignalScores,
} from "./types";

export type CodeSimilarityFn = (
  ticketTexts: string[],
  commitTexts: string[],
) => Promise<number[][]>;

export type RunEvidencePipelineOptions = {
  tickets: EvidenceTicket[];
  commits: EvidenceCommit[];
  /** Optional matrix [ticketIdx][commitIdx] cosine similarity. */
  codeSimilarity?: CodeSimilarityFn;
  topKPerTicket?: number;
};

function ticketText(ticket: EvidenceTicket): string {
  return `${ticket.summary ?? ""}\n${(ticket.descriptionText ?? "").slice(0, 1500)}`;
}

function commitText(commit: EvidenceCommit): string {
  return `${commit.subject ?? ""}\n${commit.body ?? ""}`;
}

/**
 * Deterministic multi-signal + optional code-similarity evidence pipeline (RFC §4).
 */
export async function runEvidencePipeline(
  options: RunEvidencePipelineOptions,
): Promise<PipelineResult> {
  const { tickets, commits } = options;
  const topK = options.topKPerTicket ?? 5;

  let simMatrix: number[][] | null = null;
  if (options.codeSimilarity && tickets.length && commits.length) {
    const tTexts = tickets.map(buildTicketEmbedText);
    const cTexts = commits.map(buildCommitEmbedText);
    simMatrix = await options.codeSimilarity(tTexts, cTexts);
  }

  const all: EvidenceCandidate[] = [];
  let directCount = 0;

  for (let ti = 0; ti < tickets.length; ti++) {
    const ticket = tickets[ti]!;
    const perTicket: EvidenceCandidate[] = [];

    for (let ci = 0; ci < commits.length; ci++) {
      const commit = commits[ci]!;
      const direct = hasDirectKeyMatch(
        ticket.jiraKey,
        commit.subject ?? "",
        `${commit.body ?? ""}\n${commit.subject ?? ""}`,
      );

      const authorScore = nameMatchScore(
        commit.authorName,
        commit.authorEmail,
        ticket.assigneeName,
      );
      const dateScore = dateSignalScore(commit.commitDate, {
        createdAt: ticket.createdAt,
        resolvedAt: ticket.resolvedAt,
      });
      const keywordScore = keywordSignalScore(
        ticketText(ticket),
        commitText(commit),
      );
      const keyrefScore = direct ? 0 : 0; // direct short-circuits; non-matching keys ignored here
      const codeSimScore = simMatrix?.[ti]?.[ci] ?? 0;

      const scores: SignalScores = {
        authorScore,
        dateScore,
        keywordScore,
        keyrefScore,
        codeSimScore,
      };

      const multi = compositeMultiSignal(scores);
      if (!direct && !keepCandidate(multi, scores) && codeSimScore < 0.35) {
        continue;
      }

      const composite = direct
        ? 1
        : finalComposite(multi, codeSimScore);
      const tier = assignTier(scores, multi, { direct });
      if (direct) directCount += 1;

      perTicket.push({
        ticketKey: ticket.jiraKey,
        commitSha: commit.sha,
        repoFullName: commit.repoFullName,
        tier,
        compositeScore: composite,
        signalPattern: signalPattern(scores, direct),
        scores,
        isBestGuess: false,
      });
    }

    perTicket.sort((a, b) => b.compositeScore - a.compositeScore);
    const kept = perTicket.slice(0, topK);
    if (kept[0]) kept[0].isBestGuess = true;
    all.push(...kept);
  }

  return {
    candidates: all,
    ticketCount: tickets.length,
    commitCount: commits.length,
    directCount,
  };
}

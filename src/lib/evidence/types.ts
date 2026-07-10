export type EvidenceTierName =
  | "direct"
  | "strong"
  | "moderate"
  | "reviewable"
  | "low";

export type EvidenceTicket = {
  jiraKey: string;
  projectKey: string;
  sprintId?: string | null;
  summary?: string | null;
  descriptionText?: string | null;
  assigneeName?: string | null;
  reporterName?: string | null;
  status?: string | null;
  issueType?: string | null;
  priority?: string | null;
  labels?: string[];
  storyPoints?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  resolvedAt?: string | Date | null;
};

export type EvidenceCommit = {
  sha: string;
  repoFullName: string;
  primaryBranch: string;
  authorName?: string | null;
  authorEmail?: string | null;
  commitDate?: string | Date | null;
  subject?: string | null;
  body?: string | null;
  filesTouched?: string[];
  funcSignatures?: string[];
  hunkSnippet?: string | null;
  /** Pre-built embedding text; if absent, pipeline builds from fields. */
  codeText?: string | null;
};

export type SignalScores = {
  authorScore: number;
  dateScore: number;
  keywordScore: number;
  keyrefScore: number;
  codeSimScore: number;
};

export type EvidenceCandidate = {
  ticketKey: string;
  commitSha: string;
  repoFullName: string;
  tier: EvidenceTierName;
  compositeScore: number;
  signalPattern: string;
  scores: SignalScores;
  isBestGuess: boolean;
};

export type PipelineResult = {
  candidates: EvidenceCandidate[];
  ticketCount: number;
  commitCount: number;
  directCount: number;
};

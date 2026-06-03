import type { AiAttribution } from "@/lib/code-analysis/types";

export type ClassificationResult = {
  attribution: AiAttribution;
  confidence: number;
  signals: string[];
  tools: string[];
};

const COPILOT_COAUTHOR =
  /co-authored-by:\s*.*(?:copilot|github-copilot)/i;
const CURSOR_COAUTHOR = /co-authored-by:\s*.*cursor/i;
const TOOL_FOOTER = /generated with|created with (?:chatgpt|copilot|cursor)/i;
const PR_AI_KEYWORDS = /\b(cursor|copilot|chatgpt|claude|ai[- ]generated)\b/i;

const SIGNAL_WEIGHTS: Record<string, number> = {
  copilot_coauthor: 35,
  cursor_coauthor: 35,
  tool_footer: 40,
  bulk_add: 30,
  pr_marker: 20,
  cursor_pr: 25,
  copilot_pr: 25,
};

const HIGH_THRESHOLD = 55;
const LOW_THRESHOLD = 22;

function scoreToClassification(
  score: number,
  signalCount: number,
): { attribution: AiAttribution; confidence: number } {
  if (signalCount === 0 && score === 0) {
    return { attribution: "human_only", confidence: 85 };
  }
  if (score >= HIGH_THRESHOLD) {
    return {
      attribution: "ai_generated",
      confidence: Math.min(98, 60 + signalCount * 8 + Math.floor(score / 5)),
    };
  }
  if (score >= LOW_THRESHOLD) {
    return {
      attribution: "ai_assisted",
      confidence: Math.min(90, 45 + signalCount * 6 + Math.floor(score / 4)),
    };
  }
  if (signalCount > 0 && score > 0) {
    return { attribution: "unknown", confidence: 40 + signalCount * 5 };
  }
  return { attribution: "human_only", confidence: Math.min(96, 70 + signalCount * 3) };
}

function detectTools(signals: string[]): string[] {
  const tools = new Set<string>();
  for (const s of signals) {
    if (/copilot/i.test(s)) tools.add("Copilot");
    if (/cursor/i.test(s)) tools.add("Cursor");
    if (/chatgpt/i.test(s)) tools.add("ChatGPT");
  }
  return [...tools];
}

export function classifyCommit(input: {
  message: string;
  additions: number;
  deletions: number;
  prBody?: string | null;
}): ClassificationResult {
  const signals: string[] = [];
  let score = 0;
  const message = input.message ?? "";

  if (COPILOT_COAUTHOR.test(message)) {
    signals.push("Co-authored-by: GitHub Copilot");
    score += SIGNAL_WEIGHTS.copilot_coauthor;
  }
  if (CURSOR_COAUTHOR.test(message)) {
    signals.push("Co-authored-by: Cursor");
    score += SIGNAL_WEIGHTS.cursor_coauthor;
  }
  if (TOOL_FOOTER.test(message)) {
    signals.push(`Message: ${message.split("\n")[0].slice(0, 60)}`);
    score += SIGNAL_WEIGHTS.tool_footer;
  }
  if (input.additions > 300 && input.deletions < 50) {
    signals.push(`Bulk addition (>${input.additions} lines, few deletions)`);
    score += SIGNAL_WEIGHTS.bulk_add;
  }
  if (input.prBody && PR_AI_KEYWORDS.test(input.prBody)) {
    signals.push("PR body mentions AI tooling");
    score += SIGNAL_WEIGHTS.pr_marker;
  }

  const { attribution, confidence } = scoreToClassification(score, signals.length);
  return { attribution, confidence, signals, tools: detectTools(signals) };
}

export function classifyPullRequest(input: {
  body: string | null;
  linesAdded: number;
  linesRemoved: number;
  commitClassifications: ClassificationResult[];
}): ClassificationResult {
  const signals: string[] = [];
  let score = 0;
  const body = input.body ?? "";

  if (PR_AI_KEYWORDS.test(body)) {
    if (/cursor/i.test(body)) {
      signals.push("PR body mentions Cursor");
      score += SIGNAL_WEIGHTS.cursor_pr;
    } else if (/copilot/i.test(body)) {
      signals.push("PR body mentions Copilot");
      score += SIGNAL_WEIGHTS.copilot_pr;
    } else {
      signals.push("PR body mentions AI tooling");
      score += SIGNAL_WEIGHTS.pr_marker;
    }
  }

  const aiCommits = input.commitClassifications.filter(
    (c) => c.attribution === "ai_generated" || c.attribution === "ai_assisted",
  );
  if (aiCommits.length > 0) {
    const ratio = aiCommits.length / Math.max(input.commitClassifications.length, 1);
    if (ratio >= 0.5) {
      signals.push(`${aiCommits.length} AI-classified commits in PR`);
      score += Math.round(25 * ratio);
    }
  }

  if (input.linesAdded > 500 && input.linesRemoved < 80) {
    signals.push(`Large addition (${input.linesAdded} lines)`);
    score += 15;
  }

  for (const c of input.commitClassifications) {
    for (const s of c.signals) {
      if (!signals.includes(s)) signals.push(s);
    }
    score += c.attribution === "ai_generated" ? 12 : c.attribution === "ai_assisted" ? 6 : 0;
  }

  const { attribution, confidence } = scoreToClassification(
    score,
    signals.length || aiCommits.length,
  );
  const tools = [
    ...new Set([
      ...detectTools(signals),
      ...input.commitClassifications.flatMap((c) => c.tools),
    ]),
  ];

  return { attribution, confidence, signals: signals.slice(0, 6), tools };
}

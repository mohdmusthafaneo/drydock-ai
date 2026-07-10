import type { EvidenceTierName, SignalScores } from "./types";

export function extractIssueKeys(text: string): string[] {
  const keys: string[] = [];
  const re = /\b([A-Z][A-Z0-9]+)-?(\d+)\b/gi;
  for (const match of text.matchAll(re)) {
    const project = (match[1] ?? "").toUpperCase();
    const num = match[2] ?? "";
    keys.push(`${project}-${num}`);
  }
  return keys;
}

export function hasDirectKeyMatch(
  ticketKey: string,
  subject: string,
  body: string,
): boolean {
  const hay = `${subject}\n${body}`.toUpperCase();
  const normalized = ticketKey.toUpperCase().replace(/-/g, "-?");
  // Accept CX-1234 and CX1234 forms
  const [proj, num] = ticketKey.toUpperCase().split("-");
  if (!proj || !num) return false;
  const re = new RegExp(`\\b${proj}-?${num}\\b`, "i");
  return re.test(hay) || hay.includes(normalized.replace("-?", "-"));
}

export function compositeMultiSignal(scores: Omit<SignalScores, "codeSimScore">): number {
  return (
    0.4 * scores.authorScore +
    0.35 * scores.dateScore +
    0.2 * scores.keywordScore +
    0.05 * scores.keyrefScore
  );
}

export function finalComposite(
  multiSignal: number,
  codeSim: number,
): number {
  return 0.5 * codeSim + 0.5 * Math.max(multiSignal, 0);
}

export function signalPattern(scores: SignalScores, direct: boolean): string {
  if (direct) return "CX-####";
  const parts: string[] = [];
  if (scores.authorScore > 0) parts.push("A");
  if (scores.dateScore > 0) parts.push("D");
  if (scores.keywordScore > 0) parts.push("K");
  if (scores.codeSimScore > 0) parts.push("C");
  return parts.join("+") || "none";
}

/**
 * Tier rules (RFC §4.3–4.4). Direct key match short-circuits to `direct`.
 */
export function assignTier(
  scores: SignalScores,
  multiSignal: number,
  options: { direct: boolean },
): EvidenceTierName {
  if (options.direct) return "direct";

  const { authorScore: a, dateScore: d, keywordScore: k, codeSimScore: c } =
    scores;

  if (
    a >= 0.85 &&
    ((d >= 0.85 && k >= 0.3) || (k >= 0.55 && d >= 0.45))
  ) {
    return "strong";
  }

  if (c >= 0.55 && multiSignal >= 0.3) return "strong";

  if (
    (a >= 0.85 && (d >= 0.45 || k >= 0.4)) ||
    (c >= 0.4 && multiSignal >= 0.3)
  ) {
    return "moderate";
  }

  if (multiSignal >= 0.3 || c >= 0.35) return "reviewable";
  return "low";
}

export function keepCandidate(
  multiSignal: number,
  scores: Omit<SignalScores, "codeSimScore">,
): boolean {
  const nonzero = [
    scores.authorScore,
    scores.dateScore,
    scores.keywordScore,
    scores.keyrefScore,
  ].filter((s) => s > 0).length;
  return multiSignal >= 0.3 && nonzero >= 2;
}

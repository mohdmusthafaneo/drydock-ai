import type {
  ConfidenceBand,
  OverviewPillar,
  ScoreDerivation,
  ScoreDerivationSegment,
  ScoreDerivationTone,
} from "@/lib/overview/types";

function t(text: string): ScoreDerivationSegment {
  return { kind: "text", text };
}

function e(
  text: string,
  tone: ScoreDerivationTone = "score",
): ScoreDerivationSegment {
  return { kind: "emphasis", text, tone };
}

function joinSegments(segments: ScoreDerivationSegment[]): string {
  let out = "";
  for (let i = 0; i < segments.length; i++) {
    const prev = i > 0 ? segments[i - 1]! : null;
    const seg = segments[i]!;
    if (prev) {
      const left = prev.text;
      const right = seg.text;
      if (
        left &&
        right &&
        !/\s$/.test(left) &&
        !/^\s/.test(right) &&
        !/^[.,;:!?)]/.test(right) &&
        !/\($/.test(left)
      ) {
        out += " ";
      }
    }
    out += seg.text;
  }
  return out.replace(/\s+/g, " ").trim();
}

function withDerivation(paragraphs: ScoreDerivationSegment[][]): ScoreDerivation {
  return {
    paragraphs,
    plainText: paragraphs.map(joinSegments).filter(Boolean).join("\n\n"),
  };
}

/** Join phrases in plain text — only numeric / metric pulls get emphasis. */
function listPlain(phrases: string[]): ScoreDerivationSegment[] {
  if (phrases.length === 0) return [];
  if (phrases.length === 1) return [t(phrases[0]!)];

  const parts: ScoreDerivationSegment[] = [];
  phrases.forEach((phrase, i) => {
    if (i > 0 && i === phrases.length - 1) parts.push(t(", and "));
    else if (i > 0) parts.push(t(", "));
    parts.push(t(phrase));
  });
  return parts;
}

/** Join concrete metric pulls with down-tone emphasis (counts, not adjectives). */
function listMetrics(phrases: string[]): ScoreDerivationSegment[] {
  if (phrases.length === 0) return [];
  if (phrases.length === 1) return [e(phrases[0]!, "down")];

  const parts: ScoreDerivationSegment[] = [];
  phrases.forEach((phrase, i) => {
    if (i > 0 && i === phrases.length - 1) parts.push(t(", and "));
    else if (i > 0) parts.push(t(", "));
    parts.push(e(phrase, "down"));
  });
  return parts;
}

function bandTone(band: ConfidenceBand): ScoreDerivationTone {
  if (band === "Strong") return "up";
  if (band === "Steady") return "steady";
  if (band === "At risk") return "down";
  return "score";
}

/** Short conversational name for a health dimension. */
function dimensionPhrase(id: string, label: string): string {
  switch (id) {
    case "release":
      return "release confidence";
    case "stability":
      return "operational stability";
    case "momentum":
      return "delivery momentum";
    case "engineering":
      return "engineering risk";
    case "governance":
      return "governance and data trust";
    default:
      return label.toLowerCase();
  }
}

/** How a weak/middling signal reads when it pulls the score down. */
function pullPhrase(id: string, label: string, score: number): string | null {
  if (score >= 70) return null;
  const name = dimensionPhrase(id, label);
  if (score < 40) return `no ${name}`;
  if (score < 55) return `some ${name}`;
  return `moderate ${name}`;
}

function opening(score: number, band: ConfidenceBand): ScoreDerivationSegment[] {
  return [t("You're at "), e(`${score} (${band})`, bandTone(band)), t(" this sprint. ")];
}

function gapParagraph(dataGaps?: string[]): ScoreDerivationSegment[] | null {
  if (!dataGaps?.length) return null;

  const observability = dataGaps.find((g) => /observability/i.test(g));
  if (observability) {
    return [
      t("We don't have observability data yet, so that part isn't factored in."),
    ];
  }

  if (dataGaps.length === 1) {
    return [
      t(`One gap: ${dataGaps[0]} — so that part isn't factored in.`),
    ];
  }

  return [
    t(
      `A few signals are still missing (${dataGaps.slice(0, 2).join("; ")}), so those parts aren't factored in yet.`,
    ),
  ];
}

/** Mock Overview score: completion minus blocked / spillover / bug pressure. */
export function buildMockScoreDerivation(input: {
  score: number;
  band: ConfidenceBand;
  completion: number;
  done: number;
  total: number;
  blocked: number;
  spillover: number;
  pillars: OverviewPillar[];
}): ScoreDerivation {
  const code = input.pillars.find((p) => p.id === "code");
  const qa = input.pillars.find((p) => p.id === "qa");
  const compliance = input.pillars.find((p) => p.id === "compliance");

  const pulling: string[] = [];
  if (input.spillover > 0) {
    pulling.push(
      `${input.spillover} item${input.spillover === 1 ? "" : "s"} spilling over`,
    );
  }
  if (input.blocked > 0) {
    pulling.push(
      `${input.blocked} blocked item${input.blocked === 1 ? "" : "s"}`,
    );
  }
  if (qa && qa.score < 70) {
    pulling.push(qa.footnote.toLowerCase());
  } else if (qa && /bug/i.test(qa.footnote)) {
    // Still mention open bugs when they exist even if QA pillar score is high
    const bugs = qa.footnote.match(/(\d+)\s+open bugs?/i);
    if (bugs && Number(bugs[1]) > 0) {
      pulling.push(qa.footnote.toLowerCase());
    }
  }

  const body: ScoreDerivationSegment[] = [...opening(input.score, input.band)];

  if (pulling.length > 0) {
    body.push(t("The main things pulling the score down are "));
    body.push(...listMetrics(pulling));
    body.push(t(". "));
  } else {
    body.push(t("Nothing major is dragging the score down right now. "));
  }

  const stronger: ScoreDerivationSegment[] = [];
  if (input.total > 0) {
    stronger.push(t("Sprint completion is holding at "));
    stronger.push(e(`${input.completion}%`, "up"));
  }
  const strongPillars = [code, qa, compliance].filter(
    (p): p is OverviewPillar => p != null && p.score >= 70,
  );
  // Prefer one clear "looking stronger" beat when we have a strong pillar
  const standout = strongPillars.sort((a, b) => b.score - a.score)[0];
  if (standout) {
    if (stronger.length > 0) stronger.push(t(", and "));
    stronger.push(t(`${standout.name.toLowerCase()} is looking stronger at `));
    stronger.push(e(String(standout.score), "up"));
  }
  if (stronger.length > 0) {
    body.push(...stronger);
    body.push(t("."));
  }

  const paragraphs: ScoreDerivationSegment[][] = [body];
  paragraphs.push([
    t("We don't have observability data yet, so that part isn't factored in."),
  ]);

  return withDerivation(paragraphs);
}

export function buildLiveScoreDerivation(input: {
  score: number;
  band: ConfidenceBand;
  dimensions: Array<{
    id: string;
    label: string;
    score: number;
    weight: number;
    summary: string;
  }>;
  pillars: OverviewPillar[];
  dataGaps?: string[];
}): ScoreDerivation {
  if (input.dimensions.length > 0) {
    const pulling = input.dimensions
      .map((d) => pullPhrase(d.id, d.label, d.score))
      .filter((p): p is string => p != null);

    const strong = input.dimensions
      .filter((d) => d.score >= 70)
      .sort((a, b) => b.score - a.score);

    const body: ScoreDerivationSegment[] = [...opening(input.score, input.band)];

    if (pulling.length > 0) {
      body.push(t("The main things pulling the score down are "));
      // Qualitative phrases stay plain — only the score and strong metrics pop.
      body.push(...listPlain(pulling));
      body.push(t(". "));
    } else {
      body.push(t("No single signal is dragging confidence down hard. "));
    }

    if (strong.length > 0) {
      const top = strong[0]!;
      const name = dimensionPhrase(top.id, top.label);
      const lead = name.charAt(0).toUpperCase() + name.slice(1);
      body.push(t(`${lead} is looking stronger at `));
      body.push(e(String(top.score), "up"));
      body.push(t("."));
    }

    const paragraphs: ScoreDerivationSegment[][] = [body];
    const gap = gapParagraph(input.dataGaps);
    if (gap) paragraphs.push(gap);
    return withDerivation(paragraphs);
  }

  // Pillar fallback when health dimensions are missing
  const pulling = input.pillars
    .filter((p) => p.score < 70)
    .map((p) => {
      if (p.score < 40) return `no ${p.name.toLowerCase()} signal`;
      if (p.score < 55) return `some pressure on ${p.name.toLowerCase()}`;
      return `moderate ${p.name.toLowerCase()}`;
    });

  const strong = input.pillars
    .filter((p) => p.score >= 70)
    .sort((a, b) => b.score - a.score);

  const body: ScoreDerivationSegment[] = [...opening(input.score, input.band)];
  if (pulling.length > 0) {
    body.push(t("The main things pulling the score down are "));
    body.push(...listPlain(pulling));
    body.push(t(". "));
  }
  if (strong[0]) {
    body.push(t(`${strong[0].name} is looking stronger at `));
    body.push(e(String(strong[0].score), "up"));
    body.push(t("."));
  }

  const paragraphs: ScoreDerivationSegment[][] = [body];
  const gap = gapParagraph(input.dataGaps);
  if (gap) paragraphs.push(gap);
  else {
    paragraphs.push([
      t("We don't have observability data yet, so that part isn't factored in."),
    ]);
  }

  return withDerivation(paragraphs);
}

import type { HeadlineSegment } from "@/lib/executive-briefing/types";

export function flattenHeadlineSegments(segments: HeadlineSegment[]): string {
  return segments
    .map((segment, index) => {
      if (index === 0) return segment.text;
      const prev = segments[index - 1]!;
      return `${spacingBetweenSegments(prev, segment)}${segment.text}`;
    })
    .join("");
}

export function spacingBetweenSegments(
  prev: HeadlineSegment,
  curr: HeadlineSegment,
): string {
  if (!prev.text || !curr.text) return "";
  if (/\s$/.test(prev.text) || /^\s/.test(curr.text)) return "";
  if (/[—–-]$/.test(prev.text) && /^\s/.test(curr.text)) return "";
  if (/[A-Za-z0-9%)]$/.test(prev.text) && /^[—–-]/.test(curr.text)) return " ";
  if (/[—–-]$/.test(prev.text)) return " ";
  if (/[A-Za-z0-9%)]$/.test(prev.text) && /^[A-Za-z0-9%(\[]/.test(curr.text)) {
    return " ";
  }
  return "";
}

export function ensureHeadlineSegmentSpacing(
  segments: HeadlineSegment[],
): HeadlineSegment[] {
  if (segments.length === 0) return segments;

  const normalized = segments.map((segment) => ({
    kind: segment.kind,
    text: segment.text.replace(/\s+/g, " "),
  }));

  const result: HeadlineSegment[] = [];
  for (const segment of normalized) {
    if (!segment.text) continue;

    const prev = result[result.length - 1];
    if (prev) {
      const gap = spacingBetweenSegments(prev, segment);
      if (gap && !/\s$/.test(prev.text)) {
        prev.text += gap;
      }
    }

    result.push(segment);
  }

  return coalesceAdjacentTextSegments(result);
}

function coalesceAdjacentTextSegments(
  segments: HeadlineSegment[],
): HeadlineSegment[] {
  const result: HeadlineSegment[] = [];

  for (const segment of segments) {
    const prev = result[result.length - 1];
    if (prev && prev.kind === "text" && segment.kind === "text") {
      prev.text += segment.text;
      continue;
    }
    result.push({ ...segment });
  }

  return result;
}

export function hasHeadlineSpacingDefects(segments: HeadlineSegment[]): boolean {
  const naive = segments.map((segment) => segment.text).join("");
  return (
    /[a-z][A-Z]/.test(naive) ||
    /\bat\d+\b/i.test(naive) ||
    /\bis\d+\b/i.test(naive) ||
    /\breleaseis\b/i.test(naive) ||
    /[a-z]—[A-Za-z]/.test(naive) ||
    /\d—[A-Za-z]/.test(naive) ||
    /[a-z]%\w/.test(naive) ||
    /[A-Za-z]%\w/.test(naive)
  );
}

export function extractEmphasisTokens(input: {
  health: { overall: number | null };
  highlights: { value: string }[];
  claims: { metric?: string }[];
  deterministicHeadline: HeadlineSegment[];
}): string[] {
  const tokens = new Set<string>();

  if (input.health.overall != null) {
    tokens.add(String(input.health.overall));
  }

  for (const highlight of input.highlights) {
    if (highlight.value.trim()) tokens.add(highlight.value.trim());
  }

  for (const claim of input.claims) {
    if (claim.metric?.trim()) tokens.add(claim.metric.trim());
  }

  for (const segment of input.deterministicHeadline) {
    if (segment.kind === "emphasis" && segment.text.trim()) {
      tokens.add(segment.text.trim());
    }
  }

  return [...tokens].sort((a, b) => b.length - a.length);
}

export function buildHeadlineSegmentsFromPlainText(
  headline: string,
  emphasisTokens: string[],
): HeadlineSegment[] {
  const cleaned = headline.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  type Range = { start: number; end: number };
  const emphasisRanges: Range[] = [];

  for (const token of emphasisTokens) {
    if (!token) continue;
    let searchFrom = 0;
    while (searchFrom < cleaned.length) {
      const found = cleaned.indexOf(token, searchFrom);
      if (found === -1) break;

      const overlaps = emphasisRanges.some(
        (range) => !(found >= range.end || found + token.length <= range.start),
      );
      if (!overlaps) {
        emphasisRanges.push({ start: found, end: found + token.length });
      }

      searchFrom = found + token.length;
    }
  }

  emphasisRanges.sort((a, b) => a.start - b.start);

  const segments: HeadlineSegment[] = [];
  let cursor = 0;

  for (const range of emphasisRanges) {
    if (range.start > cursor) {
      segments.push({
        kind: "text",
        text: cleaned.slice(cursor, range.start),
      });
    }
    segments.push({
      kind: "emphasis",
      text: cleaned.slice(range.start, range.end),
    });
    cursor = range.end;
  }

  if (cursor < cleaned.length) {
    segments.push({ kind: "text", text: cleaned.slice(cursor) });
  }

  return ensureHeadlineSegmentSpacing(segments);
}

export function resolveEnrichedHeadline(input: {
  headlineFromLlm: unknown;
  narrative: string;
  emphasisTokens: string[];
  deterministicHeadline: HeadlineSegment[];
}): { headline: HeadlineSegment[]; narrative: string; enriched: boolean } {
  const fallback = {
    headline: input.deterministicHeadline,
    narrative: input.narrative,
    enriched: false,
  };

  let segments: HeadlineSegment[] | null = null;

  if (typeof input.headlineFromLlm === "string" && input.headlineFromLlm.trim()) {
    segments = buildHeadlineSegmentsFromPlainText(
      input.headlineFromLlm,
      input.emphasisTokens,
    );
  } else if (Array.isArray(input.headlineFromLlm)) {
    const parsed = input.headlineFromLlm
      .filter(
        (item): item is HeadlineSegment =>
          typeof item === "object" &&
          item !== null &&
          "kind" in item &&
          "text" in item &&
          (item.kind === "text" || item.kind === "emphasis") &&
          typeof item.text === "string",
      )
      .map((item) => ({
        kind: item.kind,
        text: item.text,
      }));
    segments = ensureHeadlineSegmentSpacing(parsed);
  }

  if (!segments || segments.length === 0) {
    return fallback;
  }

  if (hasHeadlineSpacingDefects(segments)) {
    return fallback;
  }

  return {
    headline: segments,
    narrative: input.narrative.trim(),
    enriched: true,
  };
}

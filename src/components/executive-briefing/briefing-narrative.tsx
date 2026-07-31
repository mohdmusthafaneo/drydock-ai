import { cn } from "@/lib/utils";

type Props = {
  narrative: string;
  healthLabel?: string | null;
  className?: string;
};

/** Numbers, percents, and high-signal diagnostic phrases. */
const EMPHASIS_PATTERN =
  /(~?\d+(?:[.,]\d+)?%?|\bin crisis\b|\bnot in crisis\b|\bspillover\b|\bcarryover\b|\bblocked\b|\boverdue\b|\bunassigned\b|\bshape is (?:bad|strained)\b)/gi;

type NarrativePart = { text: string; emphasize: boolean };

export function splitNarrativeForEmphasis(narrative: string): NarrativePart[] {
  const parts: NarrativePart[] = [];
  let last = 0;
  const re = new RegExp(EMPHASIS_PATTERN.source, EMPHASIS_PATTERN.flags);
  for (const match of narrative.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({ text: narrative.slice(last, start), emphasize: false });
    }
    parts.push({ text: match[0]!, emphasize: true });
    last = start + match[0]!.length;
  }
  if (last < narrative.length) {
    parts.push({ text: narrative.slice(last), emphasize: false });
  }
  return parts.length > 0 ? parts : [{ text: narrative, emphasize: false }];
}

export function BriefingNarrative({ narrative, healthLabel, className }: Props) {
  const parts = splitNarrativeForEmphasis(narrative);

  return (
    <div className={cn("space-y-4", className)}>
      {healthLabel && (
        <p className="text-[15px] font-medium text-rust">{healthLabel}</p>
      )}
      <p className="max-w-prose text-[20px] leading-[1.4] tracking-[-0.2px] text-ink lg:text-[24px] lg:leading-[1.35] lg:tracking-[-0.23px]">
        {parts.map((part, index) =>
          part.emphasize ? (
            <span key={index} className="font-semibold italic text-chart-blue">
              {part.text}
            </span>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
    </div>
  );
}

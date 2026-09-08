"use client";

import { useEffect, useRef } from "react";
import { RevealSection } from "@/components/motion/reveal-section";
import { SCORE_DERIVATION_HASH } from "@/lib/overview/nav-context";
import type {
  ScoreDerivation,
  ScoreDerivationSegment,
  ScoreDerivationTone,
} from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export { SCORE_DERIVATION_HASH };

const EMPHASIS_TONE: Record<ScoreDerivationTone, string> = {
  score: "font-semibold text-[#ef5d1c]",
  steady: "font-semibold text-info",
  down: "font-semibold text-coral",
  up: "font-semibold text-success",
};

function spacingBetween(
  prev: ScoreDerivationSegment,
  next: ScoreDerivationSegment,
): string {
  const left = prev.text;
  const right = next.text;
  if (!left || !right) return "";
  if (/\s$/.test(left) || /^\s/.test(right)) return "";
  if (/^[.,;:!?)]/.test(right)) return "";
  if (/\($/.test(left)) return "";
  return " ";
}

function renderSegments(segments: ScoreDerivationSegment[], keyPrefix: string) {
  return segments.map((segment, index) => {
    const prev = index > 0 ? segments[index - 1] : null;
    const prefix = prev ? spacingBetween(prev, segment) : "";

    if (segment.kind === "emphasis") {
      const tone = segment.tone ?? "score";
      return (
        <span
          key={`${keyPrefix}-${index}`}
          className={cn("not-italic", EMPHASIS_TONE[tone])}
        >
          {prefix}
          {segment.text}
        </span>
      );
    }

    return (
      <span key={`${keyPrefix}-${index}`}>
        {prefix}
        {segment.text}
      </span>
    );
  });
}

/** Plain-English explanation of how delivery confidence is derived. */
export function ScoreDerivationPanel({
  derivation,
  className,
}: {
  derivation: ScoreDerivation;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${SCORE_DERIVATION_HASH}`) return;
    const el = ref.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (derivation.paragraphs.length === 0) return null;

  return (
    <RevealSection
      ref={ref}
      id={SCORE_DERIVATION_HASH}
      tabIndex={-1}
      aria-label={derivation.plainText}
      data-slot="score-derivation-panel"
      className={cn(
        "scroll-mt-6 rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-6 shadow-[var(--shadow)] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        className,
      )}
    >
      <span className="inline-flex w-fit items-center rounded-[8px] border border-border bg-elevated px-2.5 py-1 text-[11px] font-medium leading-none text-muted">
        How this score is built
      </span>
      <div className="mt-3 space-y-3">
        {derivation.paragraphs.map((paragraph, i) => (
          <p
            key={i}
            className="text-[16px] font-normal leading-[1.55] tracking-[-0.15px] text-secondary sm:text-[17px]"
          >
            {renderSegments(paragraph, `p${i}`)}
          </p>
        ))}
      </div>
    </RevealSection>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefingClaim } from "@/lib/executive-briefing/types";

type Props = {
  claim: BriefingClaim;
};

function extractMetric(facts: string[]): { metric: string | null; details: string[] } {
  const metricIndex = facts.findIndex((f) => /^(\d+%|\d+)/.test(f));
  if (metricIndex === -1) {
    return { metric: null, details: facts };
  }
  const fact = facts[metricIndex]!;
  const match = fact.match(/^(\d+%?)/);
  return {
    metric: match?.[1] ?? null,
    details: [...facts.slice(0, metricIndex), ...facts.slice(metricIndex + 1), fact.replace(/^\d+%?\s*/, "").trim()].filter(Boolean),
  };
}

export function BriefingClaimCard({ claim }: Props) {
  const { metric, details } = extractMetric(claim.facts);

  return (
    <article className="flex h-full flex-col rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]">
      <div className="flex items-start justify-between gap-4">
        <h3 className="min-w-0 font-display text-[18px] leading-snug tracking-[-0.14px] text-ink">
          {claim.headline}
        </h3>
        {metric && (
          <p
            className={cn(
              "shrink-0 font-display text-[32px] leading-none tracking-[-0.48px] tabular-nums",
              claim.severity === "critical" || claim.severity === "warning"
                ? "text-rust"
                : "text-chart-blue",
            )}
          >
            {metric}
          </p>
        )}
      </div>
      {details.length > 0 && (
        <ul className="mt-4 flex-1 space-y-1.5">
          {details.map((fact) => (
            <li key={fact} className="text-[14px] leading-relaxed text-ash">
              {fact}
            </li>
          ))}
        </ul>
      )}
      {claim.href && (
        <Link
          href={claim.href}
          className={cn(
            "mt-4 inline-flex items-center gap-1 text-[15px] font-medium text-ink transition-colors hover:text-rust",
            claim.severity === "critical" && "text-rust",
          )}
        >
          View details
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Link>
      )}
    </article>
  );
}

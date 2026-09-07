"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefingClaim, BriefingClaimVerdict } from "@/lib/executive-briefing/types";
import { HoverLift } from "@/components/motion/hover-lift";

type Props = {
  claim: BriefingClaim;
};

const VERDICT_STYLES: Record<
  BriefingClaimVerdict,
  { badge: string; metric: string }
> = {
  good: {
    badge: "border-dove/50 bg-fog text-ash",
    metric: "text-ink",
  },
  attention: {
    badge: "border-apricot/40 bg-apricot-wash/60 text-rust",
    metric: "text-rust",
  },
  risk: {
    badge: "border-rust/25 bg-rust/8 text-rust",
    metric: "text-rust",
  },
  neutral: {
    badge: "border-dove/50 bg-fog text-graphite",
    metric: "text-ink",
  },
};

/** Append claim-to-evidence deep-link params for domain pages. */
export function briefingEvidenceHref(href: string, claimId: string): string {
  const hashIndex = href.indexOf("#");
  const pathAndQuery = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";

  const qIndex = pathAndQuery.indexOf("?");
  const path = qIndex >= 0 ? pathAndQuery.slice(0, qIndex) : pathAndQuery;
  const existing = qIndex >= 0 ? pathAndQuery.slice(qIndex + 1) : "";
  const params = new URLSearchParams(existing);
  params.set("from", "briefing");
  params.set("claim", claimId);
  const qs = params.toString();
  return `${path}?${qs}${hash}`;
}

export function BriefingClaimCard({ claim }: Props) {
  const styles = VERDICT_STYLES[claim.verdict];
  const href = claim.href ? briefingEvidenceHref(claim.href, claim.id) : undefined;

  return (
    <HoverLift className="h-full">
      <article className="flex h-full flex-col rounded-[var(--radius-card)] border border-border bg-pure-white p-5 shadow-[var(--shadow)]">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-[8px] border px-2.5 py-1 text-[11px] font-medium leading-none",
              styles.badge,
            )}
          >
            {claim.verdictLabel}
          </span>
          {claim.metric && (
            <div className="text-right">
              <p
                className={cn(
                  "font-display text-[32px] leading-none tracking-[-0.48px] tabular-nums",
                  styles.metric,
                )}
              >
                {claim.metric}
              </p>
              {claim.metricLabel && (
                <p className="mt-1 text-[11px] text-graphite">{claim.metricLabel}</p>
              )}
            </div>
          )}
        </div>

        <h3 className="mt-4 font-display text-[18px] leading-snug tracking-[-0.14px] text-ink">
          {claim.headline}
        </h3>

        <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ash">{claim.context}</p>

        {href && (
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-1 text-[15px] font-medium text-ink transition-colors hover:text-rust"
          >
            View details
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        )}
      </article>
    </HoverLift>
  );
}

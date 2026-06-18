import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefingClaim } from "@/lib/executive-briefing/types";

type Props = {
  claim: BriefingClaim;
};

export function BriefingClaimCard({ claim }: Props) {
  return (
    <article className="flex h-full flex-col rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]">
      <h3 className="text-[15px] font-medium leading-snug text-ink">{claim.headline}</h3>
      <ul className="mt-4 flex-1 space-y-2">
        {claim.facts.map((fact) => (
          <li key={fact} className="flex gap-2 text-[14px] leading-relaxed text-ash">
            <span className="text-dove" aria-hidden>
              ·
            </span>
            <span>{fact}</span>
          </li>
        ))}
      </ul>
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

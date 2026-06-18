import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BriefingClaim } from "@/lib/executive-briefing/types";

type Props = {
  claim: BriefingClaim;
};

const SEVERITY_BORDER: Record<NonNullable<BriefingClaim["severity"]>, string> = {
  info: "border-border",
  warning: "border-warning/40",
  critical: "border-error/40",
};

export function BriefingClaimCard({ claim }: Props) {
  const severity = claim.severity ?? "info";

  return (
    <Card className={cn("h-full", SEVERITY_BORDER[severity])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold leading-snug">{claim.headline}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm text-secondary">
          {claim.facts.map((fact) => (
            <li key={fact} className="flex gap-2">
              <span className="text-muted" aria-hidden>
                ·
              </span>
              <span>{fact}</span>
            </li>
          ))}
        </ul>
        {claim.href && (
          <Link
            href={claim.href}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            View details
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

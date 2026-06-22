"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  impactTone,
  impactVerdictLabel,
  requiredRoleLabel,
  statusVerdictLabel,
} from "@/lib/governance/presentation";

const VERDICT_BADGE = {
  risk: "border-rust/25 bg-rust/8 text-rust",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  neutral: "border-dove/50 bg-fog text-graphite",
  good: "border-dove/50 bg-fog text-ash",
} as const;

const STATUS_BADGE = {
  PENDING: "border-apricot/40 bg-apricot-wash/40 text-rust",
  APPROVED: "border-dove/50 bg-fog text-ash",
  REJECTED: "border-rust/25 bg-rust/8 text-rust",
  MODIFIED: "border-dove/50 bg-fog text-graphite",
} as const;

export type RecommendationCardData = {
  id: string;
  title: string;
  description: string;
  rationale: string;
  impact: string;
  confidence: number;
  status: string;
  requiredRole: string | null;
  affectedSystems: string[];
  release: { id: string; name: string } | null;
  pendingApprovalId: string | null;
};

export function RecommendationCard({ rec }: { rec: RecommendationCardData }) {
  const [showRationale, setShowRationale] = useState(false);
  const tone = impactTone(rec.impact);
  const roleHint = requiredRoleLabel(rec.requiredRole);
  const statusStyle = STATUS_BADGE[rec.status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.PENDING;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
                VERDICT_BADGE[tone],
              )}
            >
              {impactVerdictLabel(rec.impact)}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
                statusStyle,
              )}
            >
              {statusVerdictLabel(rec.status)}
            </span>
          </div>
          <div className="text-right">
            <p className="font-display text-[28px] leading-none tracking-[-0.42px] tabular-nums text-ink">
              {(rec.confidence * 100).toFixed(0)}%
            </p>
            <p className="mt-1 text-[11px] text-graphite">Confidence</p>
          </div>
        </div>

        <div>
          <h3 className="font-display text-[20px] leading-snug tracking-[-0.14px] text-ink">
            {rec.title}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-ash">{rec.description}</p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-graphite">
          {roleHint && <span>Requires {roleHint}</span>}
          {rec.release && (
            <Link
              href={`/releases/${rec.release.id}`}
              className="font-medium text-ink underline-offset-4 hover:text-rust hover:underline"
            >
              Release: {rec.release.name}
            </Link>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 border-t border-border-subtle pt-4">
        {rec.affectedSystems.length > 0 && (
          <p className="text-[13px] text-muted">Systems: {rec.affectedSystems.join(", ")}</p>
        )}

        <button
          type="button"
          className="text-[13px] font-medium text-ink underline-offset-4 hover:text-rust hover:underline"
          onClick={() => setShowRationale((v) => !v)}
        >
          {showRationale ? "Hide rationale" : "Why this matters"}
        </button>

        {showRationale && (
          <p className="text-[14px] leading-relaxed text-ash">{rec.rationale}</p>
        )}

        {rec.pendingApprovalId && (
          <Link
            href="/approvals"
            className="inline-flex items-center gap-1 text-[14px] font-medium text-ink transition-colors hover:text-rust"
          >
            Review approval
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

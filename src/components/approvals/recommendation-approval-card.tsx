"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  impactTone,
  impactVerdictLabel,
  requiredRoleLabel,
} from "@/lib/governance/presentation";
import {
  approvalConsequenceText,
  approvalEvidenceBullets,
  approvalFreshnessLabel,
} from "@/lib/approvals/presentation";
import type { RecommendationQueue } from "@/generated/prisma/client";

const TONE_STYLES = {
  risk: "border-rust/25 bg-rust/8",
  attention: "border-apricot/40 bg-apricot-wash/50",
  neutral: "border-border-subtle bg-elevated",
  good: "border-dove/50 bg-fog",
} as const;

const VERDICT_BADGE = {
  risk: "border-rust/25 bg-rust/8 text-rust",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  neutral: "border-dove/50 bg-fog text-graphite",
  good: "border-dove/50 bg-fog text-ash",
} as const;

export type RecommendationApprovalData = {
  title: string;
  description: string;
  rationale: string;
  impact: string;
  confidence: number;
  requiredRole: string | null;
  queue: RecommendationQueue | null;
  affectedSystems: string[];
  createdAt: string | null;
  release: { id: string; name: string } | null;
};

export function RecommendationApprovalCard({
  approvalId,
  recommendation,
  riskScore,
}: {
  approvalId: string;
  recommendation: RecommendationApprovalData;
  riskScore: number | null;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tone = impactTone(recommendation.impact);
  const roleHint = requiredRoleLabel(recommendation.requiredRole);
  const consequence = approvalConsequenceText({
    queue: recommendation.queue,
    release: recommendation.release,
  });
  const evidence = approvalEvidenceBullets({
    description: recommendation.description,
    rationale: recommendation.rationale,
    affectedSystems: recommendation.affectedSystems,
  });
  const freshness = approvalFreshnessLabel(recommendation.createdAt);

  async function decide(decision: "APPROVED" | "REJECTED" | "MODIFIED") {
    if (
      (decision === "REJECTED" || decision === "MODIFIED") &&
      !comment.trim()
    ) {
      setError("Add a comment before rejecting or requesting modification");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ approvalId, decision, comment }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to submit decision");
      return;
    }

    router.refresh();
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-[24px] border p-5 shadow-[var(--shadow)]",
        TONE_STYLES[tone],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
              VERDICT_BADGE[tone],
            )}
          >
            {impactVerdictLabel(recommendation.impact)}
          </span>
          {recommendation.release && (
            <Badge variant="muted">Release: {recommendation.release.name}</Badge>
          )}
        </div>
        <div className="text-right">
          <p className="font-display text-[28px] leading-none tracking-[-0.42px] tabular-nums text-ink">
            {(recommendation.confidence * 100).toFixed(0)}%
          </p>
          <p className="mt-1 text-[11px] text-graphite">Confidence</p>
        </div>
      </div>

      <div>
        <h3 className="font-display text-[18px] leading-snug tracking-[-0.14px] text-ink">
          {recommendation.title}
        </h3>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {roleHint && (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
              Required role
            </dt>
            <dd className="mt-1 text-primary">{roleHint}</dd>
          </div>
        )}
        {riskScore != null && (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
              Risk score
            </dt>
            <dd className="mt-1 font-display text-[20px] tabular-nums text-ink">
              {riskScore.toFixed(0)}
            </dd>
          </div>
        )}
      </dl>

      <p className="rounded-xl border border-border-subtle/80 bg-pure-white/60 px-4 py-3 text-[13px] leading-relaxed text-graphite">
        {consequence}
      </p>

      {evidence.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Evidence
          </p>
          <ul className="mt-2 space-y-1.5">
            {evidence.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2 text-[14px] leading-relaxed text-ash"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-graphite" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        {recommendation.release && (
          <Link
            href={`/releases/${recommendation.release.id}`}
            className="font-medium text-ink underline-offset-4 hover:text-rust hover:underline"
          >
            View release analysis →
          </Link>
        )}
        {freshness && <span className="text-graphite">{freshness}</span>}
      </div>

      <Textarea
        placeholder="Comment required for reject / request modification…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <Button size="sm" variant="ink" disabled={loading} onClick={() => decide("APPROVED")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="link"
          className="h-auto px-0 text-error"
          disabled={loading}
          onClick={() => decide("REJECTED")}
        >
          Reject
        </Button>
        <Button
          size="sm"
          variant="link"
          className="h-auto px-0"
          disabled={loading}
          onClick={() => decide("MODIFIED")}
        >
          Request modification
        </Button>
      </div>
    </div>
  );
}

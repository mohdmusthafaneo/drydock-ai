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
  risk: "border-accent-ring bg-accent-soft",
  attention: "border-amber/40 bg-[#fffaf0]",
  neutral: "border-border bg-pure-white",
  good: "border-border bg-fog",
} as const;

const VERDICT_BADGE = {
  risk: "border-accent-ring bg-accent-soft text-brown",
  attention: "border-amber/40 bg-[#fffaf0] text-amber",
  neutral: "border-border bg-fog text-muted",
  good: "border-border bg-fog text-ash",
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
  demoMode = false,
}: {
  approvalId: string;
  recommendation: RecommendationApprovalData;
  riskScore: number | null;
  /** When true, decisions stay local (store mock / hybrid mode). */
  demoMode?: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoDecided, setDemoDecided] = useState<string | null>(null);

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

    if (demoMode) {
      setDemoDecided(decision);
      setError(null);
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

  if (demoDecided) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-elevated/60 px-5 py-4">
        <p className="text-[15px] font-semibold text-ink">
          Demo decision recorded: {demoDecided}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          This was a fixture approval — nothing was written to the ledger.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-[var(--radius-card)] border bg-pure-white p-5 shadow-[var(--shadow)]",
        TONE_STYLES[tone],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-[8px] border px-2.5 py-1 text-[11px] font-medium leading-none",
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
          <p className="text-[24px] font-semibold leading-none tracking-[-0.4px] tabular-nums text-ink">
            {(recommendation.confidence * 100).toFixed(0)}%
          </p>
          <p className="mt-1 text-[11px] text-muted">Confidence</p>
        </div>
      </div>

      <div>
        <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.2px] text-ink">
          {recommendation.title}
        </h3>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {roleHint && (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Required role
            </dt>
            <dd className="mt-1 text-primary">{roleHint}</dd>
          </div>
        )}
        {riskScore != null && (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Risk score
            </dt>
            <dd className="mt-1 text-[20px] font-semibold tabular-nums text-ink">
              {riskScore.toFixed(0)}
            </dd>
          </div>
        )}
      </dl>

      <p className="rounded-[9px] border border-border bg-pure-white/80 px-4 py-3 text-[13px] leading-relaxed text-muted">
        {consequence}
      </p>

      {evidence.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Evidence
          </p>
          <ul className="mt-2 space-y-1.5">
            {evidence.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2 text-[14px] leading-relaxed text-secondary"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
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
            className="font-medium text-brown underline-offset-4 hover:underline"
          >
            View release analysis →
          </Link>
        )}
        {freshness && <span className="text-muted">{freshness}</span>}
      </div>

      <Textarea
        placeholder="Comment required for reject / request modification…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <Button size="sm" variant="brown" disabled={loading} onClick={() => decide("APPROVED")}>
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

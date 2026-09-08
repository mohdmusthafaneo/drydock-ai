"use client";

import Link from "next/link";
import type { ComplianceFindingSummary, ComplianceFindingView } from "@/lib/compliance/types";
import { ComplianceFindingsPanel } from "@/components/governance/compliance-findings-panel";
import { PageHeader } from "@/components/layout/page-header";
import { useAppData } from "@/lib/store";

function asFindings(value: unknown): ComplianceFindingView[] {
  return Array.isArray(value) ? (value as ComplianceFindingView[]) : [];
}

function asSummary(value: unknown): ComplianceFindingSummary {
  if (value && typeof value === "object") {
    return value as ComplianceFindingSummary;
  }
  return {
    openCount: 0,
    criticalOpen: 0,
    warningOpen: 0,
    infoOpen: 0,
    lastEvaluatedAt: null,
    resolvedThisWeek: 0,
  };
}

export function GovernanceFromStore() {
  const governance = useAppData((s) => s.data.governance);
  const findings = asFindings(governance.findings);
  const summary = asSummary(governance.summary);

  if (!governance.hasDna) {
    return (
      <div className="space-y-[13px]">
        <PageHeader
          title="Compliance"
          description="Policy posture and open findings for the release in front of you."
        />
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-10 text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          Delivery DNA is not configured yet. Compliance findings still appear below when available.
        </div>
        <ComplianceFindingsPanel
          findings={findings}
          openCount={summary.openCount}
          criticalOpen={summary.criticalOpen}
          canManage={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      <PageHeader
        title="Compliance"
        description="Your Delivery DNA, approval posture, and live governance signals."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/governance/policy"
            className="text-[13px] font-medium text-brown hover:underline"
          >
            Governance policy
          </Link>
          <Link
            href="/governance/workflow"
            className="text-[13px] font-medium text-brown hover:underline"
          >
            Workflow config
          </Link>
          <Link
            href="/governance/setup"
            className="text-[13px] font-medium text-brown hover:underline"
          >
            Re-run setup
          </Link>
        </div>
      </PageHeader>

      <section
        id="dna"
        className="scroll-mt-24 rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-8 shadow-[var(--shadow)]"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
          Delivery DNA
        </p>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink">
          {governance.dnaSummary ?? "Delivery DNA is configured for this organization."}
        </p>
      </section>

      <ComplianceFindingsPanel
        findings={findings}
        openCount={summary.openCount}
        criticalOpen={summary.criticalOpen}
        canManage={false}
      />

      <div className="rounded-[var(--radius-card)] border border-[#e2ebfa] bg-[#F2F7FF] px-5 py-4 text-sm text-ash">
        AI observes, correlates, and recommends. Humans approve and supervise deployment. All
        release decisions are audit-logged.
      </div>
    </div>
  );
}

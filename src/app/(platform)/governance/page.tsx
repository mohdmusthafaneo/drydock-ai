import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import {
  approvalLevelLabel,
  autonomyModeLabel,
  buildAutonomyVerdictStrip,
  buildGovernanceDnaOverview,
  buildGovernancePolicyHighlights,
  governanceScoreBand,
  workflowModeLabel,
} from "@/lib/governance/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingHeadline } from "@/components/executive-briefing/briefing-headline";
import { GovernanceLiveSignals } from "@/components/governance/governance-live-signals";
import { ComplianceFindingsPanel } from "@/components/governance/compliance-findings-panel";
import { GovernanceEscalationPanel } from "@/components/governance/governance-escalation-panel";
import { loadComplianceFindings } from "@/lib/compliance/load-findings";
import { loadComplianceFindingSummary } from "@/lib/compliance/summary";
import { hasPermission } from "@/lib/rbac";
import { RevealSection } from "@/components/motion/reveal-section";
import { cn } from "@/lib/utils";

const VERDICT_BADGE = {
  good: "border-dove/50 bg-fog text-ash",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  risk: "border-rust/25 bg-rust/8 text-rust",
  neutral: "border-dove/50 bg-fog text-graphite",
} as const;

function formatMaturity(value: number): string {
  if (value >= 4) return "Mature";
  if (value >= 3) return "Developing";
  return "Early";
}

export default async function GovernancePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [ctx, org] = await Promise.all([
    getOrganizationContext(session.organizationId),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true },
    }),
  ]);

  const canViewCompliance = hasPermission(session, "compliance", "view");
  const canManageCompliance = hasPermission(session, "compliance", "manage");
  const [complianceFindings, complianceSummary] = canViewCompliance
    ? await Promise.all([
        loadComplianceFindings(session.organizationId, { status: "open", limit: 50 }),
        loadComplianceFindingSummary(session.organizationId),
      ])
    : [[], { openCount: 0, criticalOpen: 0, warningOpen: 0, infoOpen: 0, lastEvaluatedAt: null }];

  if (!ctx.dna) {
    redirect("/governance/setup");
  }

  const dna = ctx.dna;
  const profile = ctx.profile;
  const escalation = JSON.parse(dna.escalationMatrix || "{}") as Record<string, string>;
  const tools = profile ? (JSON.parse(profile.toolsJson || "[]") as string[]) : [];
  const workflows = profile ? (JSON.parse(profile.workflowsJson || "[]") as string[]) : [];
  const orgName = org?.name ?? "Your organization";

  const dnaOverview = buildGovernanceDnaOverview(dna, orgName);
  const highlights = buildGovernancePolicyHighlights(ctx);
  const { band, bandLabel } = governanceScoreBand(dna.governanceScore);
  const autonomyStrip = buildAutonomyVerdictStrip(dna);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Delivery DNA"
        description="Your Delivery DNA, approval posture, and live governance signals."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/governance/policy"
            className="text-[15px] font-medium text-ink hover:text-rust"
          >
            Governance policy
          </Link>
          <Link
            href="/governance/workflow"
            className="text-[15px] font-medium text-ink hover:text-rust"
          >
            Workflow config
          </Link>
          <Link
            href="/governance/setup"
            className="text-[15px] font-medium text-ink hover:text-rust"
          >
            Re-run setup
          </Link>
        </div>
      </PageHeader>

      <section
        id="dna"
        className="scroll-mt-24 rounded-[24px] border border-border-subtle bg-pure-white px-6 py-8 shadow-[var(--shadow)]"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
          Delivery DNA
        </p>
        <div className="mt-4">
          <BriefingHeadline segments={dnaOverview.headlineSegments} />
        </div>
        <ul className="mt-4 max-w-3xl space-y-2">
          {dnaOverview.bullets.map((bullet, index) => (
            <li
              key={index}
              className="flex gap-2.5 text-[14px] leading-relaxed text-ink"
            >
              <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-graphite" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] font-medium",
              VERDICT_BADGE[autonomyStrip.tone],
            )}
          >
            {autonomyStrip.label}
          </span>
          <span className="text-[13px] text-graphite">{autonomyStrip.detail}</span>
        </div>
      </section>

      <GovernanceLiveSignals
        highlights={highlights}
        score={dna.governanceScore}
        band={band}
        bandLabel={bandLabel}
      />

      {canViewCompliance && (
        <ComplianceFindingsPanel
          findings={complianceFindings}
          openCount={complianceSummary.openCount}
          criticalOpen={complianceSummary.criticalOpen}
          canManage={canManageCompliance}
        />
      )}

      <RevealSection className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Policy profile
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-muted">Workflow mode</dt>
              <dd className="mt-0.5 font-medium text-ink">{workflowModeLabel(dna.workflowMode)}</dd>
            </div>
            <div>
              <dt className="text-muted">Approval depth</dt>
              <dd className="mt-0.5 font-medium text-ink">{approvalLevelLabel(dna.approvalLevel)}</dd>
            </div>
            <div>
              <dt className="text-muted">Autonomy</dt>
              <dd className="mt-0.5 font-medium text-ink">{autonomyModeLabel(dna.autonomyMode)}</dd>
            </div>
            <div>
              <dt className="text-muted">Risk threshold</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {(dna.riskThreshold * 100).toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="text-muted">Compliance</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {profile?.complianceType?.toUpperCase() ?? "None"}
              </dd>
            </div>
          </dl>
        </div>

        {profile && (
          <div className="rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
              Discovery context
            </p>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted">Industry</dt>
                <dd className="mt-0.5 capitalize font-medium text-ink">
                  {profile.industryType ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Team size</dt>
                <dd className="mt-0.5 font-medium text-ink">{profile.teamSize ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">SDLC maturity</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {formatMaturity(profile.sdlcMaturity)} ({profile.sdlcMaturity}/5)
                </dd>
              </div>
              <div>
                <dt className="text-muted">DevOps maturity</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {formatMaturity(profile.devopsMaturity)} ({profile.devopsMaturity}/5)
                </dd>
              </div>
              {tools.length > 0 && (
                <div>
                  <dt className="text-muted">Tools</dt>
                  <dd className="mt-0.5 font-medium text-ink">{tools.join(", ")}</dd>
                </div>
              )}
              {workflows.length > 0 && (
                <div>
                  <dt className="text-muted">Workflows</dt>
                  <dd className="mt-0.5 font-medium text-ink">{workflows.join(", ")}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </RevealSection>

      {dna.observabilityStrategy && (
        <div className="rounded-[24px] border border-border-subtle bg-sky-wash/30 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Observability strategy
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-ash">{dna.observabilityStrategy}</p>
        </div>
      )}

      <GovernanceEscalationPanel escalation={escalation} />

      <div className="rounded-[24px] border border-border-subtle bg-fog/40 px-5 py-4 text-sm text-ash">
        AI observes, correlates, and recommends. Humans approve and supervise deployment. All
        release decisions are audit-logged.
      </div>
    </div>
  );
}

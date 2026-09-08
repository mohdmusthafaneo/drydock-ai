"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssessReleaseButton, DeployReleaseButton } from "@/components/releases/release-actions";
import { ExecutiveVerdictBanner } from "@/components/executive-briefing/executive-verdict-banner";
import { RevealSection } from "@/components/motion/reveal-section";
import { verdictBadgeVariant } from "@/lib/release-gate-brief";
import { useAppData } from "@/lib/store";
import type { ReleaseDetailPayload, ReleaseListItem } from "@/lib/store/types";

function asDetail(value: unknown): ReleaseDetailPayload | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Partial<ReleaseDetailPayload>;
  if (typeof d.id !== "string" || typeof d.name !== "string") return null;
  return value as ReleaseDetailPayload;
}

function detailFromListItem(item: ReleaseListItem): ReleaseDetailPayload {
  const assessed = item.status !== "DETECTED" && item.status !== "DRAFT";
  return {
    id: item.id,
    name: item.name,
    version: item.version,
    status: item.status,
    environment: "staging",
    branch: null,
    serviceScope: null,
    jiraFixVersion: null,
    jiraSprintId: null,
    assessedAt: assessed ? item.createdAt : null,
    readinessScore: null,
    governanceRiskScore: null,
    riskLevel: null,
    primaryRecommendation: null,
    assessmentSummary: null,
    deployedAt: null,
    pendingApprovalCount: 0,
    pendingRoles: [],
    gateVerdict: null,
    verdictLabel: assessed ? "Assessed" : "Awaiting assessment",
    headline: assessed ? `${item.name} — limited detail in demo store` : "Not yet assessed",
    subcopy: assessed
      ? "Full gate brief fields are not in this store payload. Assess and deploy actions still call live APIs."
      : "Run assessment to collect QA, telemetry, and governance signals.",
    detailNotes: [
      "List fields only — open after a live assess for full gate evidence.",
    ],
  };
}

export function ReleaseDetailFromStore() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const byId = useAppData((s) => s.data.releases.byId);
  const items = useAppData((s) => s.data.releases.items);

  const fromById = asDetail(byId[id]);
  const listItem = items.find((r) => r.id === id);
  const release = fromById ?? (listItem ? detailFromListItem(listItem) : null);

  if (!release) {
    return (
      <div className="space-y-6">
        <Link href="/releases" className="text-[15px] font-medium text-ink hover:text-rust">
          ← Releases
        </Link>
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-10 text-sm text-muted shadow-[var(--shadow)]">
          Release not found in the current evidence set.
        </div>
      </div>
    );
  }

  const showGateBrief = release.assessedAt != null;
  const bannerVerdict =
    release.gateVerdict === "NO-GO"
      ? "risk"
      : release.gateVerdict === "HOLD"
        ? "attention"
        : release.gateVerdict === "GO"
          ? "good"
          : "neutral";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/releases" className="text-[15px] font-medium text-ink hover:text-rust">
          ← Releases
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-[1.12] tracking-[-0.75px] text-ink">
              {release.name}
              {release.version ? ` (${release.version})` : ""}
            </h1>
            <p className="mt-2 text-[16px] text-ash">
              {release.environment}
              {release.jiraSprintId ? ` · Sprint ${release.name}` : ""}
              {release.branch ? ` · branch ${release.branch}` : ""}
              {release.jiraFixVersion && !release.jiraSprintId
                ? ` · Jira ${release.jiraFixVersion}`
                : ""}
              {release.serviceScope ? ` · project ${release.serviceScope}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {release.gateVerdict && (
              <Badge variant={verdictBadgeVariant(release.gateVerdict)} className="px-2.5 py-1">
                {release.gateVerdict}
              </Badge>
            )}
            <Badge variant="ai">{release.status.replace(/_/g, " ")}</Badge>
          </div>
        </div>
      </div>

      <RevealSection>
        <ExecutiveVerdictBanner
          verdict={bannerVerdict}
          verdictLabel={release.verdictLabel}
          headline={release.headline}
          subcopy={release.subcopy}
        />
      </RevealSection>

      {["DETECTED", "PENDING_APPROVAL", "BLOCKED"].includes(release.status) && (
        <Card className="bg-sky-wash/50">
          <CardHeader>
            <CardTitle>
              {release.status === "DETECTED" ? "Run assessment" : "Re-assess release"}
            </CardTitle>
            <CardDescription>
              {release.status === "DETECTED"
                ? "Collect telemetry & QA signals, compute governance risk and readiness scores."
                : "Re-run assessment to refresh signals and replace pending recommendations."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssessReleaseButton
              releaseId={release.id}
              reAssess={release.status !== "DETECTED"}
            />
          </CardContent>
        </Card>
      )}

      {!showGateBrief && release.status === "DETECTED" && (
        <Card className="border-dashed border-border-subtle">
          <CardHeader>
            <CardTitle>Not yet assessed</CardTitle>
            <CardDescription>
              Expected signals after assessment: Jira schedule health, GitHub CI status, Grafana
              alerts, Prometheus metrics, and governance risk scoring.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {showGateBrief && (
        <Card>
          <CardHeader>
            <CardTitle>Gate brief (demo store)</CardTitle>
            <CardDescription>
              Simplified evidence from the AppData store. Assess/deploy still hit live APIs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-secondary">
            {release.assessmentSummary && <p>{release.assessmentSummary}</p>}
            <dl className="grid gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-muted">Readiness</dt>
                <dd className="font-medium text-ink">
                  {release.readinessScore != null ? `${release.readinessScore}%` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Governance risk</dt>
                <dd className="font-medium text-ink">
                  {release.governanceRiskScore != null ? release.governanceRiskScore : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Risk level</dt>
                <dd className="font-medium capitalize text-ink">{release.riskLevel ?? "—"}</dd>
              </div>
            </dl>
            {release.pendingApprovalCount > 0 && (
              <p>
                Pending approvals: {release.pendingApprovalCount}
                {release.pendingRoles.length > 0
                  ? ` · ${release.pendingRoles.join(", ")}`
                  : ""}
              </p>
            )}
            {release.detailNotes.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {release.detailNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {release.status === "APPROVED" && (
        <Card className="bg-apricot-wash/40">
          <CardHeader>
            <CardTitle>Controlled deployment</CardTitle>
            <CardDescription>Execute deployment after governance approval</CardDescription>
          </CardHeader>
          <CardContent>
            <DeployReleaseButton releaseId={release.id} />
          </CardContent>
        </Card>
      )}

      {release.status === "DEPLOYED" && (
        <div className="rounded-[16px] border border-success/20 bg-success-muted px-4 py-3 text-sm text-success">
          Deployed
          {release.deployedAt
            ? ` ${new Date(release.deployedAt).toLocaleString()}`
            : ""}{" "}
          — audit trail recorded.
        </div>
      )}
    </div>
  );
}

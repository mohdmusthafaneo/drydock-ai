import Link from "next/link";
import { ExecutiveVerdictBanner } from "@/components/executive-briefing/executive-verdict-banner";
import { JiraIssueLink } from "@/components/delivery-analysis/jira-issue-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";

type HygieneSnapshot = NonNullable<DeliveryAnalysisSnapshot["jiraHygiene"]>;

export function JiraHygieneBanner({ hygiene }: { hygiene: HygieneSnapshot }) {
  if (!hygiene.degradesTrust) return null;

  const project = hygiene.worstProject;
  const headline = project
    ? `Project ${project.key} Jira maintenance is below threshold`
    : "Jira maintenance is below threshold";

  return (
    <ExecutiveVerdictBanner
      verdict="attention"
      verdictLabel="Low confidence"
      headline={headline}
      subcopy="Scores shown with low confidence — Jira boards are not maintained per the agreed workflow. Treat delivery KPIs as directional until hygiene improves."
    />
  );
}

export function JiraHygieneFindingsCard({ findings }: { findings: HygieneSnapshot["findings"] }) {
  if (findings.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Jira hygiene findings</CardTitle>
        <CardDescription>
          Data-trust issues — distinct from delivery blockers.{" "}
          <Link href="/governance/toolchain-mapping" className="text-chart-blue hover:underline">
            Review agreed workflow
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {findings.map((finding) => (
          <div
            key={`${finding.projectKey ?? ""}-${finding.id}-${finding.label}`}
            className="rounded-lg border border-border-subtle px-3 py-2 text-sm"
          >
            <p className="font-medium text-primary">
              {finding.projectKey ? `${finding.projectKey} · ` : ""}
              {finding.label}
            </p>
            <p className="text-secondary">{finding.value}</p>
            <p className="mt-1 text-xs text-muted">{finding.recommendation}</p>
            <JiraIssueLink href={finding.jiraUrl} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function gradeClass(grade: "good" | "fair" | "poor"): string {
  if (grade === "good") return "border-success/30 bg-success-muted text-success";
  if (grade === "fair") return "border-warning/30 bg-warning/10 text-warning";
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

export function HygieneGradeChip({ grade }: { grade: "good" | "fair" | "poor" }) {
  const labels = { good: "Hygiene good", fair: "Hygiene fair", poor: "Hygiene poor" };
  return (
    <span
      className={`shrink-0 rounded-[8px] border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${gradeClass(grade)}`}
    >
      {labels[grade]}
    </span>
  );
}

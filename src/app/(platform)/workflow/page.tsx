import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { ENTERPRISE_WORKFLOW_STEPS } from "@/lib/enterprise-workflow";
import {
  buildWorkflowAttentionSummary,
  getWorkflowStepBadges,
} from "@/lib/governance/presentation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ExecutiveVerdictBanner } from "@/components/executive-briefing/executive-verdict-banner";

export default async function WorkflowCenterPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const completed = new Set(ctx.completedStepIds);
  const stepBadges = getWorkflowStepBadges(ctx);
  const attention = buildWorkflowAttentionSummary(ctx, ctx.completedStepIds);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Workflow center"
        description="Enterprise delivery workflow — governance, QA, observability, and human approval."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary" size="lg">
            <Link href="/dashboard">Executive view</Link>
          </Button>
          <Button asChild variant="ink" size="lg">
            <Link href="/releases/new">+ Register release</Link>
          </Button>
        </div>
      </PageHeader>

      <ExecutiveVerdictBanner
        verdict={attention.attentionCount > 0 ? "attention" : "good"}
        verdictLabel={attention.attentionCount > 0 ? "Needs attention" : "On track"}
        headline={attention.headline}
        subcopy={attention.subcopy}
      />

      <Card>
        <CardHeader>
          <CardTitle>Enterprise workflow architecture</CardTitle>
          <CardDescription>
            {completed.size} of {ENTERPRISE_WORKFLOW_STEPS.length} stages complete
            {ctx.workflow?.executionStatus && ` · ${ctx.workflow.executionStatus}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {ENTERPRISE_WORKFLOW_STEPS.map((step) => {
              const done = completed.has(step.id);
              const badgeCount = stepBadges[step.id] ?? 0;
              return (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className={cn(
                      "flex items-start gap-3 rounded-[16px] px-3 py-2.5 transition-colors",
                      done
                        ? "bg-success-muted text-success"
                        : "bg-fog text-ink hover:bg-hover",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-graphite" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">
                          {step.order}. {step.label}
                        </p>
                        {badgeCount > 0 && (
                          <Badge variant="warning" className="text-[10px]">
                            {badgeCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted">{step.description}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
          Active releases
        </h2>
        {ctx.releases.length === 0 ? (
          <p className="text-sm text-muted">
            No releases — register one to run the governance pipeline.
          </p>
        ) : (
          <div className="space-y-3">
            {ctx.releases.map((r) => (
              <Link
                key={r.id}
                href={`/releases/${r.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] border border-border-subtle bg-surface px-4 py-3 shadow-[var(--shadow-subtle)] transition-colors hover:bg-hover"
              >
                <span className="font-medium text-ink">{r.name}</span>
                <Badge variant="ai">{r.status.replace(/_/g, " ")}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

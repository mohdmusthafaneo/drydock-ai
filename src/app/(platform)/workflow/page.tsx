import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { ENTERPRISE_WORKFLOW_STEPS } from "@/lib/enterprise-workflow";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WorkflowCenterPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const completed = new Set(ctx.completedStepIds);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Workflow center</h1>
          <p className="mt-1 text-slate-400">
            Enterprise delivery workflow — governance, QA, observability, and human approval.
          </p>
        </div>
        <Button asChild>
          <Link href="/releases/new">+ Register release</Link>
        </Button>
      </div>

      <Card className="border-[#4F8CFF]/20">
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
              return (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className={cn(
                      "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                      done
                        ? "bg-[#10B981]/10 text-[#6ee7b7]"
                        : "bg-[#131A2A]/60 hover:bg-[#1B2435]",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {step.order}. {step.label}
                      </p>
                      <p className="text-xs text-slate-500">{step.description}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">Active releases</h2>
        {ctx.releases.length === 0 ? (
          <p className="text-sm text-slate-500">No releases — register one to run the governance pipeline.</p>
        ) : (
          <div className="space-y-3">
            {ctx.releases.map((r) => (
              <Link
                key={r.id}
                href={`/releases/${r.id}`}
                className="flex items-center justify-between rounded-xl border border-white/8 bg-[#1B2435] px-4 py-3 hover:border-[#4F8CFF]/40"
              >
                <span className="font-medium">{r.name}</span>
                <Badge variant="ai">{r.status.replace(/_/g, " ")}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

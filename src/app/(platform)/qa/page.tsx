import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import { QA_INTELLIGENCE_WORKFLOW } from "@/lib/qa-intelligence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function QAIntelligencePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const assessed = ctx.releases.filter((r) => r.assessedAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">QA intelligence dashboard</h1>
        <p className="mt-1 text-slate-400">
          Release readiness, regression intelligence, test gaps, and performance signals.
        </p>
      </div>

      <Card className="border-[#4F8CFF]/20">
        <CardHeader>
          <CardTitle>QA intelligence workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">
            {QA_INTELLIGENCE_WORKFLOW.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Org readiness index</CardDescription>
            <CardTitle className="text-2xl">{ctx.stats.releaseReadiness}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assessed releases</CardDescription>
            <CardTitle className="text-2xl">{assessed.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open test gaps</CardDescription>
            <CardTitle className="text-2xl">
              {assessed.reduce((n, r) => n + JSON.parse(r.testGapsJson || "[]").length, 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {assessed.length === 0 ? (
        <Card className="border-dashed border-[#4F8CFF]/30">
          <CardContent className="py-10 text-center text-slate-400">
            Run a release assessment to populate QA intelligence.
            <Button asChild className="mt-4" size="sm">
              <Link href="/releases">View releases</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        assessed.map((release) => {
          const signals = JSON.parse(release.qaSignalsJson || "[]") as QASignal[];
          const gaps = JSON.parse(release.testGapsJson || "[]") as TestGap[];
          return (
            <Card key={release.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{release.name}</CardTitle>
                  <Badge variant="ai">
                    Readiness {Math.round(release.readinessScore ?? 0)}%
                  </Badge>
                </div>
                <CardDescription>{release.regressionNotes}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {signals.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg bg-[#131A2A]/60 px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{s.label}</p>
                      <p className="text-slate-500">{s.value}</p>
                    </div>
                  ))}
                </div>
                {gaps.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-400">Test gaps</p>
                    <ul className="space-y-1 text-sm">
                      {gaps.map((g, i) => (
                        <li key={i}>
                          {g.area}: {g.gap} ({g.priority})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link
                  href={`/releases/${release.id}`}
                  className="text-sm text-[#93b4ff] hover:underline"
                >
                  Open release →
                </Link>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

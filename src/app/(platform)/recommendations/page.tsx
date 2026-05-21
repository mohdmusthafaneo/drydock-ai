import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function RecommendationsCenterPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recommendations center</h1>
        <p className="mt-1 text-slate-400">
          Explainable AI proposals — scored, correlated, and routed to human governance.
        </p>
      </div>

      <div className="space-y-4">
        {ctx.recommendations.length === 0 ? (
          <Card className="border-dashed border-white/10">
            <CardContent className="py-10 text-center text-slate-500">
              Assess a release to generate governance recommendations.
            </CardContent>
          </Card>
        ) : (
          ctx.recommendations.map((rec) => {
            const systems = JSON.parse(rec.affectedSystems || "[]") as string[];
            return (
              <Card key={rec.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-lg">{rec.title}</CardTitle>
                    <div className="flex gap-2">
                      <Badge
                        variant={
                          rec.impact === "CRITICAL" || rec.impact === "HIGH"
                            ? "warning"
                            : "default"
                        }
                      >
                        {rec.impact}
                      </Badge>
                      <Badge variant="muted">{rec.status}</Badge>
                    </div>
                  </div>
                  <CardDescription>
                    Confidence {(rec.confidence * 100).toFixed(0)}%
                    {rec.requiredRole && ` · Requires ${rec.requiredRole.replace(/_/g, " ")}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{rec.description}</p>
                  <p className="text-slate-500">
                    <span className="text-slate-400">Rationale: </span>
                    {rec.rationale}
                  </p>
                  {systems.length > 0 && (
                    <p className="text-slate-500">Systems: {systems.join(", ")}</p>
                  )}
                  {rec.release && (
                    <Link
                      href={`/releases/${rec.release.id}`}
                      className="text-[#93b4ff] hover:underline"
                    >
                      Linked release: {rec.release.name} →
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

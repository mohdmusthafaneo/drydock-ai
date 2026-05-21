import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AgentsManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agents management</h1>
        <p className="mt-1 text-slate-400">
          Governance-aware agent hierarchy — orchestrated with strict boundaries (Master FRD §10).
        </p>
      </div>

      {ctx.agents.length === 0 ? (
        <Card className="border-dashed border-white/10">
          <CardContent className="py-10 text-center text-slate-500">
            Complete governance setup to initialize the agent registry.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ctx.agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{agent.displayName}</CardTitle>
                  <Badge variant={agent.status === "ACTIVE" ? "success" : "muted"}>
                    {agent.status}
                  </Badge>
                </div>
                <CardDescription>{agent.agentType.replace(/_/g, " ")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {agent.description && (
                  <p className="text-slate-400">{agent.description}</p>
                )}
                <p>
                  Confidence: {(agent.confidenceScore * 100).toFixed(0)}% · Mode:{" "}
                  {agent.autonomyMode}
                </p>
                {agent.lastActiveAt && (
                  <p className="text-xs text-slate-500">
                    Last active {agent.lastActiveAt.toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600">
        LangGraph / CrewAI / Temporal orchestration — Phase 2+ runtime integration.
      </p>
    </div>
  );
}

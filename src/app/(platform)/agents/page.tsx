import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { hasPermission } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { AgentsListPanel } from "@/components/agents/agents-list-panel";

export default async function AgentsManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!hasPermission(session, "agents", "view")) {
    redirect("/dashboard");
  }

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const canManageAgents = hasPermission(session, "agents", "manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Governed agent control plane — heartbeats, wakeups, and human approval gates."
      />

      <AgentsListPanel showDevHints={canManageAgents} />

      {canManageAgents && (
        <p className="text-xs text-graphite">
          Invoke queues a wakeup (async). Drain the queue with{" "}
          <code className="text-ash">npm run worker:agents</code> in dev or run
          the worker service (<code className="text-ash">AIDOS_PROCESS_ROLE=worker</code>)
          in production.
        </p>
      )}
    </div>
  );
}

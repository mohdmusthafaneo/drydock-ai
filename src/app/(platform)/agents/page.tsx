import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { PageHeader } from "@/components/layout/page-header";
import { AgentsListPanel } from "@/components/agents/agents-list-panel";

export default async function AgentsManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Governed agent control plane — heartbeats, wakeups, and human approval gates."
      />

      <AgentsListPanel />

      <p className="text-xs text-graphite">
        Invoke queues a wakeup (async). Drain the queue with{" "}
        <code className="text-ash">npm run worker:agents</code> in dev or{" "}
        <code className="text-ash">POST /api/cron/agents/worker</code>{" "}
        (Bearer PLATFORM_WORKER_SECRET) every 30–60s in production.
      </p>
    </div>
  );
}

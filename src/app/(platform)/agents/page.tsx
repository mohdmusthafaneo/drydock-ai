import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { AgentsListPanel } from "@/components/agents/agents-list-panel";

export default async function AgentsManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <p className="mt-1 text-slate-400">
          Governed agent control plane — heartbeats, wakeups, and human approval gates.
        </p>
      </div>

      <AgentsListPanel />

      <p className="text-xs text-slate-600">
        Invoke queues a wakeup (async). Drain the queue with{" "}
        <code className="text-slate-500">npm run worker:agents</code> in dev or{" "}
        <code className="text-slate-500">POST /api/cron/agents/worker</code>{" "}
        (Bearer PLATFORM_WORKER_SECRET) every 30–60s in production.
      </p>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { AgentsList } from "@/components/agents/agents-list";

export default async function AgentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session, "agents", "view")) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">
          Agents
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted">
          Configure org-level instructions for analysis and chat agents. Enabled
          lines are appended to each agent&apos;s system prompt at runtime.
        </p>
      </div>
      <AgentsList />
    </div>
  );
}

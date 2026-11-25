import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { parseAgentKey } from "@/lib/agents/keys";
import { AgentInstructionsPanel } from "@/components/agents/agent-instructions-panel";

type PageProps = { params: Promise<{ agentKey: string }> };

export default async function AgentDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session, "agents", "view")) redirect("/dashboard");

  const { agentKey: raw } = await params;
  const agentKey = parseAgentKey(raw);
  if (!agentKey) notFound();

  return (
    <AgentInstructionsPanel
      agentKey={agentKey}
      canManage={hasPermission(session, "agents", "manage")}
    />
  );
}

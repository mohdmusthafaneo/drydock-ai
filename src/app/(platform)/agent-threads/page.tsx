import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { hasPermission } from "@/lib/rbac";
import { ChatWorkspace } from "@/components/agent-chat/chat-workspace";

export default async function AgentThreadsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!hasPermission(session, "agents", "view")) {
    redirect("/dashboard");
  }

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return <ChatWorkspace />;
}

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { getAgentChatThread } from "@/lib/agent-chat";
import { ChatWorkspace } from "@/components/agent-chat/chat-workspace";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AgentThreadDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!hasPermission(session, "agents", "view")) {
    redirect("/dashboard");
  }

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!dna) redirect("/governance/setup");

  const { id } = await params;
  const thread = await getAgentChatThread(session.organizationId, id);
  if (!thread) notFound();

  return <ChatWorkspace threadId={id} />;
}

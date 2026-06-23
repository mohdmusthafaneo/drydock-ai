import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { getAgentChatThread } from "@/lib/agent-chat";
import { ThreadDetailPanel } from "@/components/agent-chat/thread-detail-panel";

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 lg:max-w-4xl">
      <div>
        <Link
          href="/agent-threads"
          className="text-sm font-medium text-ink underline-offset-4 hover:underline"
        >
          ← Agent threads
        </Link>
      </div>

      <ThreadDetailPanel threadId={id} />
    </div>
  );
}

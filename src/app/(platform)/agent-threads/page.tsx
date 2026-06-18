import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ThreadListTabs } from "@/components/agent-chat/thread-list";
import { ThreadListPanel } from "@/components/agent-chat/thread-list-panel";

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AgentThreadsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const params = await searchParams;
  const statusParam = params.status === "done" ? "done" : "open";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent threads"
        description="Governed group chat with the Super Agent and invited specialists."
      >
        <Button asChild variant="ink" size="lg" className="rounded-full">
          <Link href="/agent-threads/new">New thread</Link>
        </Button>
      </PageHeader>

      <ThreadListTabs active={statusParam} />

      <ThreadListPanel
        status={statusParam}
        emptyLabel={
          statusParam === "done"
            ? "No closed threads yet."
            : "No open threads. Start a conversation with your agent team."
        }
      />
    </div>
  );
}

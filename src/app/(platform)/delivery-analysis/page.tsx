import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import { hasPermission } from "@/lib/rbac";
import { DeliveryAnalysisPageClient } from "@/components/delivery-analysis/delivery-analysis-page-client";

export default async function DeliveryAnalysisPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true },
  });

  if (org?.workspaceMode === "MVP") {
    redirect("/accelerator");
  }

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const jira = ctx.integrations.find(
    (i) => i.provider === "JIRA" && isJiraOAuthConnected(i),
  );

  const jiraConnected = Boolean(jira);
  const jiraMeta = jira ? parseJiraMeta(jira.metadataJson) : null;
  const projectKeys = jiraMeta?.projectKeys ?? [];
  const deliverySnapshot = jiraMeta?.deliverySnapshot ?? null;
  const lastSyncedAt = deliverySnapshot?.syncedAt ?? jira?.lastSyncAt?.toISOString() ?? null;
  const canSync = hasPermission(session, "integrations", "manage_integrations");

  return (
    <DeliveryAnalysisPageClient
      jiraConnected={jiraConnected}
      projectKeys={projectKeys}
      hasSnapshot={Boolean(deliverySnapshot)}
      lastSyncedAt={lastSyncedAt}
      canSync={canSync}
    />
  );
}

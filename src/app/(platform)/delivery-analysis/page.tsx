import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import { hasPermission } from "@/lib/rbac";
import { formatDistanceToNow } from "@/lib/format-date";
import { DeliveryAnalysisPageClient } from "@/components/delivery-analysis/delivery-analysis-page-client";
import { BriefingContextChip } from "@/components/briefing/briefing-context-chip";
import { DataTrustStrip } from "@/components/trust/data-trust-strip";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DeliveryAnalysisPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;

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

  const lastSyncLabel = lastSyncedAt
    ? formatDistanceToNow(new Date(lastSyncedAt))
    : null;
  const blindSpots: string[] = [];
  if (!jiraConnected) blindSpots.push("Jira not connected");
  else if (projectKeys.length === 0) blindSpots.push("No Jira projects selected");
  else if (!deliverySnapshot) blindSpots.push("Delivery snapshot not synced");

  return (
    <div className="space-y-4">
      <BriefingContextChip from={sp.from} />
      <DataTrustStrip lastSyncLabel={lastSyncLabel} blindSpots={blindSpots} />
      <DeliveryAnalysisPageClient
        jiraConnected={jiraConnected}
        projectKeys={projectKeys}
        hasSnapshot={Boolean(deliverySnapshot)}
        lastSyncedAt={lastSyncedAt}
        canSync={canSync}
      />
    </div>
  );
}

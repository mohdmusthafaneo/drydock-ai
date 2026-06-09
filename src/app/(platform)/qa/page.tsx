import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { QACockpit } from "@/components/qa/qa-cockpit";

export default async function QAIntelligencePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const pendingApprovalReleaseIds = new Set(
    ctx.releases.filter((r) => r.status === "PENDING_APPROVAL").map((r) => r.id),
  );

  return (
    <QACockpit
      orgReadinessIndex={ctx.stats.releaseReadiness}
      releases={ctx.releases}
      integrations={ctx.integrations}
      pendingApprovalReleaseIds={pendingApprovalReleaseIds}
    />
  );
}

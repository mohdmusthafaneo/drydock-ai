import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import {
  isPrometheusTrulyConnected,
  parsePrometheusMeta,
} from "@/lib/prometheus-meta";
import { getAvailableMockServiceScopes } from "@/lib/observability-analysis/mock-data";
import { ObservabilityPageClient } from "@/components/observability/observability-page-client";

export default async function ObservabilityPage() {
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

  const prometheus = ctx.integrations.find(
    (i) => i.provider === "PROMETHEUS" && i.status === "CONNECTED",
  );

  const meta = prometheus ? parsePrometheusMeta(prometheus.metadataJson) : null;
  const isStubConnection = meta?.mode === "observability-stub";
  const prometheusConnected = Boolean(prometheus);
  const trulyConnected = isPrometheusTrulyConnected(prometheus);
  const hasSnapshot = Boolean(meta?.operationalSnapshot);
  const lastSyncedAt = prometheus?.lastSyncAt?.toISOString() ?? null;
  const canSync = hasPermission(session, "integrations", "manage_integrations");

  const configuredScopes = meta?.serviceScopes ?? [];

  // P1 UI shell: stub connections preview mock dashboard; truly connected with scopes but no snapshot uses mock until P2
  const showP1MockPreview =
    (isStubConnection && prometheusConnected) ||
    (trulyConnected && configuredScopes.length > 0 && !hasSnapshot);

  const serviceScopes =
    configuredScopes.length > 0
      ? configuredScopes
      : showP1MockPreview && isStubConnection
        ? getAvailableMockServiceScopes()
        : [];

  return (
    <ObservabilityPageClient
      prometheusConnected={prometheusConnected}
      isStubConnection={isStubConnection}
      serviceScopes={serviceScopes}
      hasSnapshot={hasSnapshot}
      lastSyncedAt={lastSyncedAt}
      canSync={canSync}
      showP1MockPreview={showP1MockPreview}
    />
  );
}

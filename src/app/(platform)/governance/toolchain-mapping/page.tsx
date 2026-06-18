import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ToolchainMappingForm } from "@/components/governance/toolchain-mapping-form";
import { PageHeader } from "@/components/layout/page-header";
import {
  hasIntegrationSyncForToolchainDiscovery,
  inferToolchainMapping,
  mergeToolchainMapping,
  parseToolchainMapping,
} from "@/lib/toolchain-mapping";

export default async function ToolchainMappingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [profile, integrations, dna] = await Promise.all([
    prisma.organizationProfile.findUnique({ where: { organizationId: session.organizationId } }),
    prisma.integration.findMany({ where: { organizationId: session.organizationId } }),
    prisma.deliveryDNA.findUnique({ where: { organizationId: session.organizationId } }),
  ]);

  if (!dna) redirect("/governance/setup");

  const inferred = inferToolchainMapping({ profile, integrations });
  const saved = parseToolchainMapping(profile?.toolchainMappingJson);
  const mapping = mergeToolchainMapping(inferred, saved);
  const syncReady = hasIntegrationSyncForToolchainDiscovery(integrations);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/workflow"
        className="inline-block text-[15px] font-medium text-ink hover:text-rust"
      >
        ← Workflow center
      </Link>
      <PageHeader
        title="Delivery toolchain mapping"
        description="Every team runs Jira and GitHub differently. Confirm how your organization tracks work, releases, and code so AIDOS governance intelligence uses the right semantics — not generic assumptions."
        className="pb-4"
      />

      <ToolchainMappingForm
        initialMapping={mapping}
        confirmed={Boolean(profile?.toolchainMappingConfirmedAt)}
        syncReady={syncReady}
      />
    </div>
  );
}

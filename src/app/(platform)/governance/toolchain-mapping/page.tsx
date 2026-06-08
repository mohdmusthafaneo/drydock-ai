import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ToolchainMappingForm } from "@/components/governance/toolchain-mapping-form";
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
      <div>
        <Link href="/workflow" className="text-sm text-[#93b4ff] hover:underline">
          ← Workflow center
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Delivery toolchain mapping</h1>
        <p className="mt-1 text-slate-400">
          Every team runs Jira and GitHub differently. Confirm how your organization tracks work,
          releases, and code so AIDOS governance intelligence uses the right semantics — not
          generic assumptions.
        </p>
      </div>

      <ToolchainMappingForm
        initialMapping={mapping}
        confirmed={Boolean(profile?.toolchainMappingConfirmedAt)}
        syncReady={syncReady}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DiscoveryWizard } from "@/components/discovery/discovery-wizard";
import { PageHeader } from "@/components/layout/page-header";
import { readJsonField } from "@/lib/json-field";

export type DiscoveryFormInitial = {
  industryType: string;
  teamSize: string;
  sdlcMaturity: number;
  devopsMaturity: number;
  governanceLevel: number;
  complianceType: string;
  deploymentStrategy: string;
  tools: string[];
  workflows: string[];
};

function profileToInitial(
  profile: NonNullable<Awaited<ReturnType<typeof prisma.organizationProfile.findUnique>>>,
): DiscoveryFormInitial {
  return {
    industryType: profile.industryType ?? "technology",
    teamSize: profile.teamSize ?? "11-50",
    sdlcMaturity: profile.sdlcMaturity,
    devopsMaturity: profile.devopsMaturity,
    governanceLevel: profile.governanceLevel,
    complianceType: profile.complianceType ?? "none",
    deploymentStrategy: profile.deploymentStrategy ?? "continuous",
    tools: readJsonField(profile.toolsJson, []) as string[],
    workflows: readJsonField(profile.workflowsJson, []) as string[],
  };
}

export default async function GovernanceSetupPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [profile, org] = await Promise.all([
    prisma.organizationProfile.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { name: true },
    }),
  ]);

  const initialForm = profile?.completedAt ? profileToInitial(profile) : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Discovery & Delivery DNA"
        description={
          initialForm
            ? "Update your org context — existing answers are pre-filled. Review before regenerating DNA."
            : "Configure org maturity, compliance, tooling, and delivery policies. This generates your Delivery DNA."
        }
      />
      <DiscoveryWizard
        embedded
        organizationName={org?.name ?? "Your organization"}
        initialForm={initialForm}
      />
    </div>
  );
}

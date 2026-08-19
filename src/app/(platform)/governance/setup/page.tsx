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

/**
 * Get tool IDs for integrations that are already connected for this org.
 * Used to pre-select only connected integrations in the Discovery wizard,
 * rather than always hardcoding ['github', 'jira'].
 */
async function getConnectedTools(organizationId: string): Promise<string[]> {
  const integrations = await prisma.integration.findMany({
    where: { organizationId, status: "CONNECTED" },
    select: { provider: true },
  });
  const connected = new Set(integrations.map((i: { provider: string }) => i.provider.toLowerCase()));
  const toolIds: string[] = [];
  if (connected.has("github")) toolIds.push("github");
  if (connected.has("jira")) toolIds.push("jira");
  if (connected.has("grafana")) toolIds.push("grafana");
  if (connected.has("prometheus")) toolIds.push("prometheus");
  if (connected.has("slack")) toolIds.push("slack");
  return toolIds;
}

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

  const [profile, org, connectedTools] = await Promise.all([
    prisma.organizationProfile.findUnique({
      where: { organizationId: session!.organizationId },
    }),
    prisma.organization.findUnique({
      where: { id: session!.organizationId },
      select: { name: true },
    }),
    getConnectedTools(session!.organizationId),
  ]);

  let initialForm: DiscoveryFormInitial | undefined;
  if (profile?.completedAt) {
    initialForm = profileToInitial(profile);
  } else {
    // New profile: pre-select only actually-connected tools
    // Feature flag: NEXT_PUBLIC_DISCOVERY_CONNECTED_TOOLS=1 enables this behavior
    const useConnectedToolsPreSelect =
      process.env.ENABLE_CONNECTED_TOOLS_PRESELECT === "1";
    const tools =
      useConnectedToolsPreSelect && connectedTools.length > 0
        ? connectedTools
        : ["github", "jira"];
    initialForm = {
      industryType: "technology",
      teamSize: "11-50",
      sdlcMaturity: 3,
      devopsMaturity: 3,
      governanceLevel: 3,
      complianceType: "none",
      deploymentStrategy: "continuous",
      tools,
      workflows: ["scrum", "devops"],
    };
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Discovery & Delivery DNA"
        description={
          initialForm
            ? "Update your org context — existing answers are pre-filled. Review before regenerating DNA."
            : "Three steps: organization, governance posture, then review. Maturity and tooling are optional under Advanced."
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

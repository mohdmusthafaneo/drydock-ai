import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { parseIntegrationMeta } from "../src/lib/integration-meta";
import { parseToolchainMapping } from "../src/lib/toolchain-mapping";
import { getInstallationToken } from "../src/lib/github-app-auth";

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: "connexus" },
    include: { profile: true },
  });
  if (!org) throw new Error("connexus org not found");

  const gh = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId: org.id, provider: "GITHUB" },
    },
  });
  if (!gh) throw new Error("github integration not found");

  const meta = parseIntegrationMeta(gh.metadataJson);
  if (!meta.installationId) throw new Error("missing installationId");

  const mapping = org.profile?.toolchainMappingJson
    ? parseToolchainMapping(org.profile.toolchainMappingJson)
    : null;
  const primaryBranch = mapping?.github?.primaryDefaultBranch;
  if (!primaryBranch) {
    throw new Error("primaryDefaultBranch not set in org toolchain mapping — expected dev for connexus");
  }

  const token = await getInstallationToken(meta.installationId);
  const repos = (meta.repoFullNames ?? []).join(" ");

  console.log(`export GITHUB_TOKEN='${token}'`);
  console.log(`export REPOS='${repos}'`);
  console.log(`export PRIMARY_BRANCH='${primaryBranch}'`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

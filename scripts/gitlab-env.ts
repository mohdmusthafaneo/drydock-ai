import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getGitLabCredentialToken } from "../src/lib/integrations/gitlab-credentials";
import { parseGitLabMeta } from "../src/lib/gitlab-meta";
import { listMembershipProjects } from "../src/lib/gitlab-api";

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function main() {
  const slug = process.argv[2];
  const connected = await prisma.integration.findMany({
    where: { provider: "GITLAB", status: "CONNECTED" },
    include: { organization: { select: { id: true, slug: true } } },
  });

  const matches = slug
    ? connected.filter((row) => row.organization.slug === slug)
    : connected;

  if (matches.length === 0) {
    throw new Error(
      slug
        ? `No connected GitLab integration for org '${slug}'`
        : "No connected GitLab integration. Connect from /integrations first.",
    );
  }
  if (!slug && matches.length > 1) {
    const slugs = matches.map((row) => row.organization.slug).join(", ");
    throw new Error(`Multiple GitLab connections. Pass an org slug: ${slugs}`);
  }

  const integration = matches[0];
  const meta = parseGitLabMeta(integration.metadataJson);
  const baseUrl = meta.baseUrl ?? "https://gitlab.com";
  const host = new URL(baseUrl).host;
  const token = await getGitLabCredentialToken(integration.organizationId);
  const projects = await listMembershipProjects(token, baseUrl);

  console.log(`export GITLAB_TOKEN=${shellSingleQuote(token)}`);
  console.log(`export GITLAB_HOST=${shellSingleQuote(host)}`);
  console.log(`export GITLAB_BASE_URL=${shellSingleQuote(baseUrl)}`);
  if (meta.username) {
    console.log(`# account @${meta.username}`);
  }
  console.log("# projects (membership):");
  for (const project of projects) {
    const branch = project.default_branch ?? "HEAD";
    console.log(`#   ${project.path_with_namespace}  (${branch})`);
  }
  console.log(
    "# token is valid now; git fetch refreshes it via scripts/gitlab-git-credential.ts",
  );
  console.log(
    '# git clone "https://oauth2:${GITLAB_TOKEN}@${GITLAB_HOST}/group/project.git"',
  );
  console.log(
    '# curl -H "Authorization: Bearer ${GITLAB_TOKEN}" "${GITLAB_BASE_URL}/api/v4/projects?membership=true&simple=true"',
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

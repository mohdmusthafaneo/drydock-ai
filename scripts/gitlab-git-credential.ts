/**
 * Git credential helper. Git calls this on clone/fetch/pull.
 * Prints a valid GitLab access token, refreshing the stored pair when it is
 * inside 5 minutes of expiry. Does not rotate a token that is still valid.
 *
 *   git config --local credential.helper ''
 *   git config --local credential.https://gitlab.com.helper \
 *     '!cd /path/to/drydock-ai && env DRYDOCK_GITLAB_ORG=tpt-platform ./node_modules/.bin/tsx scripts/gitlab-git-credential.ts'
 */
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(repoRoot, ".env"), quiet: true });

type ConnectedOrg = {
  organizationId: string;
  slug: string;
  baseUrl: string;
};

async function readStdin(): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const fields: Record<string, string> = {};
  for (const line of Buffer.concat(chunks).toString("utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    fields[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return fields;
}

async function main() {
  const action = process.argv[2] ?? "get";
  if (action !== "get") return;

  const request = await readStdin();
  const host = request.host;
  if (!host) return;

  const { prisma } = await import("../src/lib/prisma");
  const { parseGitLabMeta } = await import("../src/lib/gitlab-meta");
  const { getGitLabCredentialToken } = await import(
    "../src/lib/integrations/gitlab-credentials"
  );

  try {
    const rows = await prisma.integration.findMany({
      where: { provider: "GITLAB", status: "CONNECTED" },
      include: { organization: { select: { id: true, slug: true } } },
    });

    const wanted = process.env.DRYDOCK_GITLAB_ORG?.trim();
    const matches: ConnectedOrg[] = [];
    for (const row of rows) {
      const meta = parseGitLabMeta(row.metadataJson);
      const baseUrl = meta.baseUrl ?? "https://gitlab.com";
      let rowHost = "";
      try {
        rowHost = new URL(baseUrl).host;
      } catch {
        continue;
      }
      if (rowHost !== host) continue;
      if (wanted && row.organization.slug !== wanted) continue;
      matches.push({
        organizationId: row.organization.id,
        slug: row.organization.slug,
        baseUrl,
      });
    }

    if (matches.length !== 1) {
      const hint =
        matches.length === 0
          ? `no GitLab connection for ${host}`
          : `set DRYDOCK_GITLAB_ORG to one of: ${matches.map((m) => m.slug).join(", ")}`;
      console.error(`gitlab credential: ${hint}`);
      process.exitCode = 1;
      return;
    }

    const token = await getGitLabCredentialToken(matches[0].organizationId);
    process.stdout.write(`username=oauth2\npassword=${token}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

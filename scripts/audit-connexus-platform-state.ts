/**
 * Audit Connexus org platform state vs Jira ground truth.
 * Run: npx tsx scripts/audit-connexus-platform-state.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { parseJiraMeta } from "../src/lib/jira-meta";
import { parseToolchainMapping } from "../src/lib/toolchain-mapping";
import { resolveJiraAccessToken } from "../src/lib/jira-api";
import { countIssuesByJql } from "../src/lib/jira-api";

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: "connexus" },
    include: {
      releases: true,
      integrations: true,
      deliveryWorkflow: true,
    },
  });
  if (!org) throw new Error("connexus org not found");

  console.log("=== ORG ===", org.name, org.slug);
  console.log("\n=== RELEASES (AIDOS DB) ===");
  for (const r of org.releases) {
    console.log(
      JSON.stringify({
        id: r.id,
        name: r.name,
        version: r.version,
        status: r.status,
        env: r.environment,
        assessedAt: r.assessedAt,
        readinessScore: r.readinessScore,
        governanceRiskScore: r.governanceRiskScore,
      }),
    );
  }

  const jira = org.integrations.find((i) => i.provider === "JIRA");
  console.log("\n=== JIRA INTEGRATION ===");
  if (!jira) {
    console.log("NOT FOUND");
  } else {
    const meta = parseJiraMeta(jira.metadataJson);
    console.log(
      JSON.stringify({
        status: jira.status,
        lastSyncAt: jira.lastSyncAt,
        projectKeys: meta.projectKeys,
        siteUrl: meta.siteUrl,
        hasSnapshot: !!meta.deliverySnapshot?.syncedAt,
        syncedAt: meta.deliverySnapshot?.syncedAt,
        dataQualityFlags: meta.deliverySnapshot?.dataQualityFlags,
      }),
    );
    if (meta.deliverySnapshot?.projects) {
      console.log("\n=== STORED JIRA SNAPSHOT ===");
      for (const p of meta.deliverySnapshot.projects) {
        console.log(
          JSON.stringify({
            key: p.key,
            openIssues: p.openIssues,
            blockedCount: p.blockedCount,
            overdueCount: p.overdueCount,
            reopenedCount: p.reopenedCount,
            spilloverCount: p.spilloverCount,
            bugsOpen: p.bugsOpen,
            resolvedLast7d: p.resolvedLast7d,
            activeSprint: p.activeSprint,
            statusBreakdown: p.statusBreakdown,
            versionCount: p.versions?.length,
          }),
        );
      }
    }
  }

  console.log("\n=== TOOLCHAIN MAPPING ===");
  if (org.deliveryWorkflow?.toolchainMappingJson) {
    const m = parseToolchainMapping(org.deliveryWorkflow.toolchainMappingJson);
    console.log(
      JSON.stringify(
        {
          methodology: m.jira?.methodology,
          releaseTracking: m.jira?.releaseTracking,
          projectKeys: m.jira?.projectKeys,
          doneStatusNames: m.jira?.doneStatusNames,
          blockedStatusName: m.jira?.blockedStatusName,
          calibrationComplete: m.inferredFrom?.calibrationComplete,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("NOT CONFIGURED");
  }

  // Live Jira ground truth for Sprint 35
  if (jira?.status === "CONNECTED") {
    const { accessToken, cloudId } = await resolveJiraAccessToken(jira);
    const sprintId = 807;
    const [total, done, open, spillover] = await Promise.all([
      countIssuesByJql(accessToken, cloudId, `sprint = ${sprintId} AND project = CX`),
      countIssuesByJql(
        accessToken,
        cloudId,
        `sprint = ${sprintId} AND project = CX AND status = Done`,
      ),
      countIssuesByJql(
        accessToken,
        cloudId,
        `sprint = ${sprintId} AND project = CX AND statusCategory != Done`,
      ),
      countIssuesByJql(
        accessToken,
        cloudId,
        `sprint = ${sprintId} AND project = CX AND statusCategory != Done AND created < "2026-06-16"`,
      ),
    ]);
    console.log("\n=== LIVE JIRA GROUND TRUTH (Sprint 35 / CX) ===");
    console.log(JSON.stringify({ total, done, open, spillover, donePct: Math.round((done / total) * 100) }));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

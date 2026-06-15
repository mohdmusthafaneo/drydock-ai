/**
 * Phase M2/M4 — migrate agent adapterType from legacy `llm` or `internal` to `mastra`.
 *
 * Usage:
 *   npx tsx scripts/migrate-adapter-type-mastra.ts          # dry-run
 *   npx tsx scripts/migrate-adapter-type-mastra.ts --apply   # execute
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const LEGACY_ADAPTER_TYPES = ["llm", "internal"] as const;
const apply = process.argv.includes("--apply");

async function main() {
  const agents = await prisma.agentRegistry.findMany({
    where: { adapterType: { in: [...LEGACY_ADAPTER_TYPES] } },
    select: {
      id: true,
      organizationId: true,
      displayName: true,
      agentType: true,
      adapterType: true,
    },
    orderBy: [{ organizationId: "asc" }, { displayName: "asc" }],
  });

  if (agents.length === 0) {
    console.log(
      `No agents with adapterType in [${LEGACY_ADAPTER_TYPES.join(", ")}] — nothing to migrate.`,
    );
    return;
  }

  const byType = Object.fromEntries(
    LEGACY_ADAPTER_TYPES.map((type) => [
      type,
      agents.filter((a) => a.adapterType === type).length,
    ]),
  );

  console.log(
    `${apply ? "Applying" : "Dry-run"}: ${agents.length} agent(s) → mastra`,
  );
  console.log(`  llm: ${byType.llm ?? 0}, internal: ${byType.internal ?? 0}`);

  for (const agent of agents) {
    console.log(
      `  - ${agent.displayName} (${agent.agentType}, ${agent.adapterType}) org=${agent.organizationId}`,
    );
  }

  if (!apply) {
    console.log("\nRe-run with --apply to update records.");
    return;
  }

  const result = await prisma.agentRegistry.updateMany({
    where: { adapterType: { in: [...LEGACY_ADAPTER_TYPES] } },
    data: { adapterType: "mastra" },
  });

  console.log(`\nUpdated ${result.count} agent(s) to adapterType=mastra.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

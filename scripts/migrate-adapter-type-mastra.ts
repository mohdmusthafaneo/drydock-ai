/**
 * Phase M2 — migrate agent adapterType from legacy `llm` to `mastra`.
 *
 * Usage:
 *   npx tsx scripts/migrate-adapter-type-mastra.ts          # dry-run
 *   npx tsx scripts/migrate-adapter-type-mastra.ts --apply   # execute
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const apply = process.argv.includes("--apply");

async function main() {
  const agents = await prisma.agentRegistry.findMany({
    where: { adapterType: "llm" },
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
    console.log("No agents with adapterType=llm — nothing to migrate.");
    return;
  }

  console.log(
    `${apply ? "Applying" : "Dry-run"}: ${agents.length} agent(s) llm → mastra`,
  );

  for (const agent of agents) {
    console.log(
      `  - ${agent.displayName} (${agent.agentType}) org=${agent.organizationId}`,
    );
  }

  if (!apply) {
    console.log("\nRe-run with --apply to update records.");
    return;
  }

  const result = await prisma.agentRegistry.updateMany({
    where: { adapterType: "llm" },
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

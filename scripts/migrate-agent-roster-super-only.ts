/**
 * Phase 5.0 — migrate existing orgs to Super-Agent-only roster.
 * Removes specialist agents; updates Super Agent to mastra adapter + Phase 5.0 config.
 *
 * Usage:
 *   npx tsx scripts/migrate-agent-roster-super-only.ts          # dry-run
 *   npx tsx scripts/migrate-agent-roster-super-only.ts --apply   # execute
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { DEFAULT_AGENT_DEFINITIONS } from "@/lib/agents";
import {
  defaultRuntimeConfigForAgentType,
  serializeRuntimeConfig,
} from "@/lib/agent-control-plane/runtime-config";
import { ensureAgentApiKey } from "@/lib/agent-control-plane/api-keys";
import {
  ensureSuperAgentInstructions,
} from "@/lib/agent-control-plane/instructions/service";

const SUPER_AGENT = DEFAULT_AGENT_DEFINITIONS[0];
const apply = process.argv.includes("--apply");

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let totalRemoved = 0;
  let totalUpdated = 0;
  let totalCreated = 0;

  for (const org of orgs) {
    const agents = await prisma.agentRegistry.findMany({
      where: { organizationId: org.id },
      orderBy: { agentType: "asc" },
    });

    if (agents.length === 0) continue;

    const superAgent = agents.find((a) => a.agentType === "SUPER_ORCHESTRATOR");
    const specialists = agents.filter((a) => a.agentType !== "SUPER_ORCHESTRATOR");

    if (specialists.length === 0 && superAgent) {
      const needsUpdate =
        superAgent.adapterType !== "mastra" ||
        superAgent.displayName !== SUPER_AGENT.displayName ||
        !superAgent.permissionsJson.includes("canCreateAgents");

      if (needsUpdate) {
        console.log(`[${org.name}] Super Agent only — will update config`);
        if (apply) {
          await updateSuperAgent(org.id, superAgent.id);
          totalUpdated++;
        }
      } else {
        console.log(`[${org.name}] Already Super-Agent-only — skip`);
      }
      continue;
    }

    console.log(
      `[${org.name}] ${agents.length} agents → remove ${specialists.length} specialist(s)${
        superAgent ? ", update Super" : ", create Super"
      }`,
    );

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      if (specialists.length > 0) {
        await tx.agentRegistry.deleteMany({
          where: {
            organizationId: org.id,
            agentType: { not: "SUPER_ORCHESTRATOR" },
          },
        });
        totalRemoved += specialists.length;
      }

      const runtimeConfig = defaultRuntimeConfigForAgentType(SUPER_AGENT.agentType);
      const permissionsJson = JSON.stringify({ canCreateAgents: true });

      if (superAgent) {
        await tx.agentRegistry.update({
          where: { id: superAgent.id },
          data: {
            displayName: SUPER_AGENT.displayName,
            description: SUPER_AGENT.description,
            runtimeConfigJson: serializeRuntimeConfig(runtimeConfig),
            permissionsJson,
            adapterType: "mastra",
            reportsToAgentId: null,
          },
        });
        await ensureAgentApiKey(tx, org.id, superAgent.id, "bootstrap");
        const { adapterConfig } = await ensureSuperAgentInstructions(org.id, superAgent.id);
        await tx.agentRegistry.update({
          where: { id: superAgent.id },
          data: { adapterConfigJson: JSON.stringify(adapterConfig) },
        });
        totalUpdated++;
      } else {
        const created = await tx.agentRegistry.create({
          data: {
            organizationId: org.id,
            agentType: SUPER_AGENT.agentType,
            displayName: SUPER_AGENT.displayName,
            description: SUPER_AGENT.description,
            confidenceScore: SUPER_AGENT.defaultConfidence,
            autonomyMode: SUPER_AGENT.autonomyMode,
            status: "IDLE",
            runtimeConfigJson: serializeRuntimeConfig(runtimeConfig),
            permissionsJson,
            adapterType: "mastra",
            adapterConfigJson: "{}",
            lastActiveAt: new Date(),
          },
        });
        await ensureAgentApiKey(tx, org.id, created.id, "bootstrap");
        const { adapterConfig } = await ensureSuperAgentInstructions(org.id, created.id);
        await tx.agentRegistry.update({
          where: { id: created.id },
          data: { adapterConfigJson: JSON.stringify(adapterConfig) },
        });
        totalCreated++;
      }
    });
  }

  console.log("");
  if (!apply) {
    console.log("Dry-run complete. Re-run with --apply to execute changes.");
    return;
  }

  console.log(
    `Done. Removed ${totalRemoved} specialist agent(s), updated ${totalUpdated}, created ${totalCreated} Super Agent(s).`,
  );
}

async function updateSuperAgent(organizationId: string, agentId: string) {
  const runtimeConfig = defaultRuntimeConfigForAgentType(SUPER_AGENT.agentType);
  await prisma.$transaction(async (tx) => {
    await tx.agentRegistry.update({
      where: { id: agentId },
      data: {
        displayName: SUPER_AGENT.displayName,
        description: SUPER_AGENT.description,
        runtimeConfigJson: serializeRuntimeConfig(runtimeConfig),
        permissionsJson: JSON.stringify({ canCreateAgents: true }),
        adapterType: "mastra",
        reportsToAgentId: null,
      },
    });
    await ensureAgentApiKey(tx, organizationId, agentId, "bootstrap");
  });

  const { adapterConfig } = await ensureSuperAgentInstructions(organizationId, agentId);
  await prisma.agentRegistry.update({
    where: { id: agentId },
    data: { adapterConfigJson: JSON.stringify(adapterConfig) },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

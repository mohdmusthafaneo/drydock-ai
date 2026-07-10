import { prisma } from "../src/lib/prisma";
import { ensureSpecialistCompanionFiles } from "../src/lib/agent-control-plane/instructions/service";
import { serializeRuntimeConfig, SPECIALIST_HEARTBEAT } from "../src/lib/agent-control-plane/runtime-config";
import { readJsonField } from "@/lib/json-field";

async function main() {
  const specialists = await prisma.agentRegistry.findMany({
    where: {
      agentType: { not: "SUPER_ORCHESTRATOR" },
      status: { not: "TERMINATED" },
    },
  });

  for (const agent of specialists) {
    const materialized = await ensureSpecialistCompanionFiles(agent.organizationId, {
      id: agent.id,
      role: agent.role,
    });

    const runtime = readJsonField<{ heartbeat?: { wakeOnApproval?: boolean } }>(
      agent.runtimeConfigJson,
      {},
    );
    if (runtime?.heartbeat?.wakeOnApproval === false) {
      await prisma.agentRegistry.update({
        where: { id: agent.id },
        data: {
          runtimeConfigJson: serializeRuntimeConfig({ heartbeat: SPECIALIST_HEARTBEAT }),
        },
      });
      console.log(`Updated runtime config: ${agent.displayName}`);
    }

    console.log(
      `${agent.displayName} (${agent.status}): materialized ${materialized.join(", ") || "already complete"}`,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

import { prisma } from "../src/lib/prisma";
import { readJsonField } from "@/lib/json-field";

async function main() {
  const agents = await prisma.agentRegistry.findMany({ orderBy: { createdAt: "asc" } });
  console.log("=== AGENTS ===");
  for (const a of agents) {
    console.log(
      JSON.stringify({
        id: a.id,
        type: a.agentType,
        role: a.role,
        name: a.displayName,
        status: a.status,
      }),
    );
  }

  const pending = await prisma.approval.findMany({
    where: { decision: null },
    orderBy: { createdAt: "asc" },
    include: { recommendation: true },
  });
  console.log("\n=== PENDING APPROVALS ===");
  for (const ap of pending) {
    const payload = readJsonField<Record<string, unknown>>(ap.payloadJson, {});
    const bundle = payload.instructionsBundle as
      | { files?: Record<string, string> }
      | undefined;
    console.log(
      JSON.stringify({
        id: ap.id,
        type: ap.type,
        title: ap.title,
        recTitle: ap.recommendation?.title,
        role: payload.role,
        agentId: payload.agentId,
        agentsMd: bundle?.files?.["AGENTS.md"],
      }),
    );
  }

  const decided = await prisma.approval.findMany({
    where: { type: "AGENT_HIRE", decision: { not: null } },
    orderBy: { decidedAt: "desc" },
    take: 5,
  });
  console.log("\n=== DECIDED HIRE APPROVALS ===");
  for (const ap of decided) {
    const payload = readJsonField<Record<string, unknown>>(ap.payloadJson, {});
    console.log(
      JSON.stringify({
        id: ap.id,
        decision: ap.decision,
        role: payload.role,
        agentId: payload.agentId,
      }),
    );
  }

  const workflows = await prisma.deliveryWorkflow.findMany({
    select: { organizationId: true, agentTeamInitializedAt: true },
  });
  console.log("\n=== WORKFLOWS ===", JSON.stringify(workflows, null, 2));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

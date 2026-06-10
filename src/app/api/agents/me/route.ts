import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAgentRequest, parsePermissions } from "@/lib/agent-control-plane/agent-auth";
import { parseRuntimeConfig } from "@/lib/agent-control-plane/runtime-config";

export async function GET(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent, organizationId } = auth;

  let managerChain: { id: string; agentType: string; displayName: string }[] =
    [];
  if (agent.reportsToAgentId) {
    const manager = await prisma.agentRegistry.findFirst({
      where: { id: agent.reportsToAgentId, organizationId },
    });
    if (manager) {
      managerChain = [
        {
          id: manager.id,
          agentType: manager.agentType,
          displayName: manager.displayName,
        },
      ];
    }
  }

  const runId = request.headers.get("x-run-id");

  const workflow = await prisma.deliveryWorkflow.findUnique({
    where: { organizationId },
    select: { agentTeamInitializedAt: true },
  });

  const directReports =
    agent.agentType === "SUPER_ORCHESTRATOR"
      ? await prisma.agentRegistry.findMany({
          where: {
            organizationId,
            reportsToAgentId: agent.id,
            status: { notIn: ["TERMINATED", "PENDING_APPROVAL"] },
          },
          select: {
            id: true,
            agentType: true,
            role: true,
            displayName: true,
            status: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  return NextResponse.json({
    agent: {
      id: agent.id,
      agentType: agent.agentType,
      role: agent.role,
      displayName: agent.displayName,
      status: agent.status,
      autonomyMode: agent.autonomyMode,
      adapterType: agent.adapterType,
    },
    organizationId,
    organization: {
      agentTeamInitializedAt: workflow?.agentTeamInitializedAt?.toISOString() ?? null,
    },
    permissions: parsePermissions(agent.permissionsJson),
    runtimeConfig: parseRuntimeConfig(agent.runtimeConfigJson),
    managerChain,
    directReports,
    heartbeatRunId: runId,
  });
}

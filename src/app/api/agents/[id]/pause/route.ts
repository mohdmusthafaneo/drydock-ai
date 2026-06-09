import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAgentActivity, logAgentAudit } from "@/lib/agent-control-plane/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.status === "PAUSED") {
    return NextResponse.json({ error: "Agent is already paused" }, { status: 409 });
  }

  if (agent.status === "RUNNING") {
    return NextResponse.json(
      { error: "Cannot pause agent while running" },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.agentRegistry.update({
      where: { id: agent.id },
      data: { status: "PAUSED" },
    });

    await logAgentActivity(tx, {
      organizationId: session.organizationId,
      type: "agent.paused",
      title: `${agent.displayName} paused`,
      metadata: { agentId: agent.id, userId: session.userId },
    });

    await logAgentAudit(tx, {
      organizationId: session.organizationId,
      action: "agent.paused",
      entityType: "AgentRegistry",
      entityId: agent.id,
      metadata: { userId: session.userId },
    });
  });

  return NextResponse.json({ ok: true });
}

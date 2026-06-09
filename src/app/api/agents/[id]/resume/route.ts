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

  if (agent.status !== "PAUSED") {
    return NextResponse.json(
      { error: `Agent is ${agent.status}, not paused` },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.agentRegistry.update({
      where: { id: agent.id },
      data: { status: "IDLE" },
    });

    await logAgentActivity(tx, {
      organizationId: session.organizationId,
      type: "agent.resumed",
      title: `${agent.displayName} resumed`,
      metadata: { agentId: agent.id, userId: session.userId },
    });

    await logAgentAudit(tx, {
      organizationId: session.organizationId,
      action: "agent.resumed",
      entityType: "AgentRegistry",
      entityId: agent.id,
      metadata: { userId: session.userId },
    });
  });

  return NextResponse.json({ ok: true });
}

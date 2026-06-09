import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { enqueueWakeup, isAgentRunnable } from "@/lib/agent-control-plane/wakeup";

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

  if (!isAgentRunnable(agent.status)) {
    return NextResponse.json(
      { error: `Agent cannot be invoked while ${agent.status}` },
      { status: 409 },
    );
  }

  const result = await enqueueWakeup({
    organizationId: session.organizationId,
    agentId: agent.id,
    source: "on_demand",
    reason: "manual.invoke",
    payload: { invokedByUserId: session.userId },
    idempotencyKey: `manual:${agent.id}:${Date.now()}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    wakeupId: result.wakeupId,
    coalesced: result.coalesced,
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      reportsTo: {
        select: { id: true, agentType: true, displayName: true },
      },
      heartbeatRuns: {
        orderBy: { startedAt: "desc" },
        take: 10,
      },
      _count: {
        select: {
          wakeupRequests: { where: { status: "queued" } },
        },
      },
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    agent: {
      id: agent.id,
      agentType: agent.agentType,
      displayName: agent.displayName,
      description: agent.description,
      status: agent.status,
      autonomyMode: agent.autonomyMode,
      confidenceScore: agent.confidenceScore,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      lastActiveAt: agent.lastActiveAt,
      adapterType: agent.adapterType,
      runtimeConfig: JSON.parse(agent.runtimeConfigJson),
      pendingWakeups: agent._count.wakeupRequests,
      reportsTo: agent.reportsTo,
    },
    recentRuns: agent.heartbeatRuns.map((run) => ({
      id: run.id,
      status: run.status,
      source: run.source,
      reason: run.reason,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      summary: run.summary,
      error: run.error,
    })),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agents = await prisma.agentRegistry.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { agentType: "asc" },
    include: {
      heartbeatRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          wakeupRequests: { where: { status: "queued" } },
        },
      },
    },
  });

  return NextResponse.json({
    agents: agents.map((agent) => {
      const lastRun = agent.heartbeatRuns[0] ?? null;
      return {
        id: agent.id,
        agentType: agent.agentType,
        displayName: agent.displayName,
        description: agent.description,
        status: agent.status,
        autonomyMode: agent.autonomyMode,
        confidenceScore: agent.confidenceScore,
        lastHeartbeatAt: agent.lastHeartbeatAt,
        lastActiveAt: agent.lastActiveAt,
        pendingWakeups: agent._count.wakeupRequests,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              source: lastRun.source,
              reason: lastRun.reason,
              startedAt: lastRun.startedAt,
              finishedAt: lastRun.finishedAt,
              summary: lastRun.summary,
            }
          : null,
      };
    }),
  });
}

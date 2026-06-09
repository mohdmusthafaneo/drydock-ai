import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string; wakeupId: string }> };

const TERMINAL_WAKEUP_STATUSES = new Set(["completed", "skipped", "coalesced"]);

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: agentId, wakeupId } = await params;

  const wakeup = await prisma.agentWakeupRequest.findFirst({
    where: {
      id: wakeupId,
      agentId,
      organizationId: session.organizationId,
    },
    include: {
      agent: { select: { status: true, displayName: true } },
      heartbeatRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!wakeup) {
    return NextResponse.json({ error: "Wakeup not found" }, { status: 404 });
  }

  const run = wakeup.heartbeatRuns[0];
  let tokenUsage: {
    inputTokens?: number;
    outputTokens?: number;
    mode?: string;
  } = {};

  if (run) {
    try {
      tokenUsage = JSON.parse(run.tokenUsageJson) as typeof tokenUsage;
    } catch {
      tokenUsage = {};
    }
  }

  return NextResponse.json({
    wakeupId: wakeup.id,
    status: wakeup.status,
    source: wakeup.source,
    reason: wakeup.reason,
    coalescedCount: wakeup.coalescedCount,
    requestedAt: wakeup.requestedAt,
    startedAt: wakeup.startedAt,
    finishedAt: wakeup.finishedAt,
    error: wakeup.error,
    agentStatus: wakeup.agent.status,
    done: TERMINAL_WAKEUP_STATUSES.has(wakeup.status),
    run: run
      ? {
          id: run.id,
          status: run.status,
          summary: run.summary,
          error: run.error,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          tokenUsage,
        }
      : null,
  });
}

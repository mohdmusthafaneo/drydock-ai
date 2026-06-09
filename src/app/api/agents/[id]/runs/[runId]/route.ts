import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type RouteParams = { params: Promise<{ id: string; runId: string }> };

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, runId } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true, displayName: true, agentType: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const run = await prisma.agentHeartbeatRun.findFirst({
    where: {
      id: runId,
      agentId: id,
      organizationId: session.organizationId,
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const tokenUsage = parseJson(run.tokenUsageJson, {
    inputTokens: 0,
    outputTokens: 0,
    mode: "rule-engine" as string | undefined,
  });
  const logs = parseJson<Array<{ at: string; level: string; message?: string }>>(
    run.logsJson,
    [],
  );
  const contextSnapshot = parseJson<Record<string, unknown>>(
    run.contextSnapshotJson,
    {},
  );

  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      source: run.source,
      reason: run.reason,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      summary: run.summary,
      error: run.error,
      exitCode: run.exitCode,
      tokenUsage,
      logs,
      contextSnapshot,
      wakeupRequestId: run.wakeupRequestId,
    },
    agent,
  });
}

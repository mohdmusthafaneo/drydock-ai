import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { readJsonField } from "@/lib/json-field";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 100);

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const runs = await prisma.agentHeartbeatRun.findMany({
    where: { agentId: id, organizationId: session.organizationId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    runs: runs.map((run) => {
      const tokenUsage = readJsonField<{
        inputTokens?: number;
        outputTokens?: number;
        mode?: string;
      }>(run.tokenUsageJson, {});
      return {
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
      };
    }),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { assessReleaseForAgent } from "@/lib/agent-control-plane/tools/release-tools";
import { isToolAllowed } from "@/lib/agent-control-plane/tools/registry";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isToolAllowed(auth.agent.agentType, "assess_release")) {
    return NextResponse.json({ error: "Tool not allowed" }, { status: 403 });
  }

  const runId = request.headers.get("x-run-id");
  if (runId) {
    const run = await prisma.agentHeartbeatRun.findFirst({
      where: {
        id: runId,
        agentId: auth.agent.id,
        organizationId: auth.organizationId,
        status: "running",
      },
    });
    if (!run) {
      return NextResponse.json(
        { error: "Invalid or inactive heartbeat run" },
        { status: 400 },
      );
    }
  }

  const { id: releaseId } = await params;

  const result = await assessReleaseForAgent({
    organizationId: auth.organizationId,
    agentId: auth.agent.id,
    agentType: auth.agent.agentType,
    releaseId,
  });

  if (result.skipped) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        reason: result.reason,
        releaseId: result.releaseId,
        recommendationId: result.recommendationId,
      },
      { status: result.reason === "Release not found" ? 404 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    releaseId: result.releaseId,
    recommendationId: result.recommendationId,
    assessment: {
      summary: result.assessment?.summary,
      governanceRiskScore: result.assessment?.governanceRiskScore,
      readinessScore: result.assessment?.qa.readinessScore,
      riskLevel: result.assessment?.riskLevel,
      primaryRecommendation: result.assessment?.primaryRecommendation,
    },
  });
}

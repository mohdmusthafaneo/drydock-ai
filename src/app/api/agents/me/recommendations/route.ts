import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { createAgentRecommendation } from "@/lib/agent-control-plane/recommendations";
import { isToolAllowed } from "@/lib/agent-control-plane/tools/registry";

const schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  rationale: z.string().min(1),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  confidence: z.number().min(0).max(1),
  affectedSystems: z.array(z.string()).optional(),
  requiredRole: z
    .enum(["QA_LEAD", "DEVOPS_LEAD", "ENGINEERING_MANAGER", "ORG_ADMIN"])
    .optional(),
  releaseId: z.string().optional(),
  createApproval: z.boolean().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isToolAllowed(auth.agent.agentType, "create_recommendation")) {
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

  try {
    const body = schema.parse(await request.json());

    const result = await createAgentRecommendation({
      organizationId: auth.organizationId,
      agentId: auth.agent.id,
      title: body.title,
      description: body.description,
      rationale: body.rationale,
      confidence: body.confidence,
      impact: body.impact ?? "MEDIUM",
      affectedSystems: body.affectedSystems ?? [],
      requiredRole: body.requiredRole,
      releaseId: body.releaseId,
      createApproval: body.createApproval ?? true,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create recommendation" }, { status: 500 });
  }
}

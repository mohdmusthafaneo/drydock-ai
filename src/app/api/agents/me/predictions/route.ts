import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { isToolAllowed } from "@/lib/agent-control-plane/tools/registry";
import {
  loadPredictionSummary,
  loadProblemPredictions,
} from "@/lib/problem-prediction/load-predictions";

const querySchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  severity: z.enum(["critical", "warning", "info"]).optional(),
  domain: z
    .enum(["delivery", "devops", "compliance", "planning", "code"])
    .optional(),
  projectKey: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isToolAllowed(auth.agent.agentType, "read_predictions")) {
    return NextResponse.json({ error: "Tool not allowed" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    domain: searchParams.get("domain") ?? undefined,
    projectKey: searchParams.get("projectKey") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const [predictions, summary] = await Promise.all([
    loadProblemPredictions(auth.organizationId, parsed.data),
    loadPredictionSummary(auth.organizationId),
  ]);

  return NextResponse.json({
    ok: true,
    predictions,
    summary,
  });
}

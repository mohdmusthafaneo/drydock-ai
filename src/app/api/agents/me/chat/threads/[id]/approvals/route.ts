import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { requestThreadApproval } from "@/lib/agent-chat/approvals";

type RouteParams = { params: Promise<{ id: string }> };

const approvalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  rationale: z.string().max(4000).optional(),
  action: z.string().min(1).max(100),
  requiredRole: z
    .enum(["QA_LEAD", "DEVOPS_LEAD", "ENGINEERING_MANAGER", "ORG_ADMIN"])
    .optional(),
  riskScore: z.number().min(0).max(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = approvalSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const result = await requestThreadApproval({
    organizationId: auth.organizationId,
    threadId,
    agentId: auth.agent.id,
    ...parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    approvalId: result.approvalId,
    messageId: result.messageId,
  });
}

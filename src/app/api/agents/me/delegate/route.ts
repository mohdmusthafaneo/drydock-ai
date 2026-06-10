import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import {
  delegateToRole,
  delegateWakeup,
  EVENT_ROLE_ROUTING,
} from "@/lib/agent-control-plane/delegation";
import { HIRE_ROLES } from "@/lib/agent-control-plane/hire";

const delegateSchema = z
  .object({
    targetAgentId: z.string().optional(),
    targetRole: z.enum(HIRE_ROLES).optional(),
    reason: z.string().min(1).max(200),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => Boolean(v.targetAgentId || v.targetRole), {
    message: "targetAgentId or targetRole is required",
  });

export async function POST(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = delegateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const runId = request.headers.get("x-run-id") ?? undefined;
  const { targetAgentId, targetRole, reason, payload } = parsed.data;

  let result;
  if (targetAgentId) {
    result = await delegateWakeup({
      organizationId: auth.organizationId,
      delegatingAgentId: auth.agent.id,
      targetAgentId,
      reason,
      payload,
      runId,
    });
  } else if (targetRole) {
    result = await delegateToRole(
      auth.organizationId,
      auth.agent.id,
      targetRole,
      reason,
      payload,
      runId,
    );
  } else {
    return NextResponse.json({ error: "targetAgentId or targetRole required" }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    wakeupId: result.wakeupId,
    coalesced: result.coalesced,
    targetAgent: "targetAgent" in result ? result.targetAgent : undefined,
  });
}

/** GET — role routing hints for Super Agent delegation. */
export async function GET() {
  return NextResponse.json({
    eventRoleRouting: EVENT_ROLE_ROUTING,
    roles: HIRE_ROLES,
  });
}

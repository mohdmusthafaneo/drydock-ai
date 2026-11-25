import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import {
  parseAgentKey,
  reorderInstructions,
  reorderInstructionsSchema,
} from "@/lib/agents";

type RouteContext = { params: Promise<{ agentKey: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "agents", "manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { agentKey: rawKey } = await context.params;
  const agentKey = parseAgentKey(rawKey);
  if (!agentKey) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  try {
    const body = reorderInstructionsSchema.parse(await request.json());
    const instructions = await reorderInstructions({
      organizationId: session.organizationId,
      userId: session.userId,
      agentKey,
      orderedIds: body.orderedIds,
    });
    return NextResponse.json({ ok: true, instructions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid reorder payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

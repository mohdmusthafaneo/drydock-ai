import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import {
  deleteInstruction,
  parseAgentKey,
  updateInstruction,
  updateInstructionSchema,
} from "@/lib/agents";

type RouteContext = { params: Promise<{ agentKey: string; id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "agents", "manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { agentKey: rawKey, id } = await context.params;
  const agentKey = parseAgentKey(rawKey);
  if (!agentKey) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  try {
    const body = updateInstructionSchema.parse(await request.json());
    if (
      body.title === undefined &&
      body.content === undefined &&
      body.enabled === undefined &&
      body.sortOrder === undefined
    ) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const instruction = await updateInstruction({
      organizationId: session.organizationId,
      userId: session.userId,
      agentKey,
      id,
      title: body.title,
      content: body.content,
      enabled: body.enabled,
      sortOrder: body.sortOrder,
    });
    if (!instruction) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, instruction });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid instruction";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "agents", "manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { agentKey: rawKey, id } = await context.params;
  const agentKey = parseAgentKey(rawKey);
  if (!agentKey) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  const deleted = await deleteInstruction({
    organizationId: session.organizationId,
    userId: session.userId,
    agentKey,
    id,
  });
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import {
  createInstruction,
  createInstructionSchema,
  listInstructions,
  parseAgentKey,
} from "@/lib/agents";

type RouteContext = { params: Promise<{ agentKey: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "agents", "view");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { agentKey: rawKey } = await context.params;
  const agentKey = parseAgentKey(rawKey);
  if (!agentKey) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  const instructions = await listInstructions(
    session.organizationId,
    agentKey,
  );
  return NextResponse.json({ agentKey, instructions });
}

export async function POST(request: Request, context: RouteContext) {
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
    const body = createInstructionSchema.parse(await request.json());
    const instruction = await createInstruction({
      organizationId: session.organizationId,
      userId: session.userId,
      agentKey,
      title: body.title,
      content: body.content,
      enabled: body.enabled,
    });
    return NextResponse.json({ ok: true, instruction }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid instruction";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

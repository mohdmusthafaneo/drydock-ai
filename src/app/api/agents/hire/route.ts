import { NextResponse } from "next/server";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { createAgentHireRequest } from "@/lib/agent-control-plane/hire";

export async function POST(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!auth.permissions.canCreateAgents) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const result = await createAgentHireRequest({
      organizationId: auth.organizationId,
      requestingAgentId: auth.agent.id,
      body,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      agentId: result.agentId,
      approvalId: result.approvalId,
      coalesced: result.coalesced,
    });
  } catch {
    return NextResponse.json({ error: "Invalid hire request" }, { status: 400 });
  }
}

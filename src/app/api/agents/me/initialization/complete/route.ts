import { NextResponse } from "next/server";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { markAgentTeamInitialized } from "@/lib/agent-control-plane/hire";

export async function POST(request: Request) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.agent.agentType !== "SUPER_ORCHESTRATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await markAgentTeamInitialized(
    auth.organizationId,
    auth.agent.id,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    alreadyInitialized: result.alreadyInitialized,
  });
}

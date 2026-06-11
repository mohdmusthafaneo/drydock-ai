import { NextResponse } from "next/server";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { reopenAgentChatThread } from "@/lib/agent-chat";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.agent.agentType !== "SUPER_ORCHESTRATOR") {
    return NextResponse.json({ error: "Only Super Agent may reopen threads" }, { status: 403 });
  }

  const { id: threadId } = await params;

  const result = await reopenAgentChatThread({
    organizationId: auth.organizationId,
    threadId,
    reopeningAgentId: auth.agent.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}

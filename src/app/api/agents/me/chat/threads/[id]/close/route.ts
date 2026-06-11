import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { closeAgentChatThread } from "@/lib/agent-chat";

type RouteParams = { params: Promise<{ id: string }> };

const closeSchema = z.object({
  summaryMarkdown: z.string().min(1).max(8000),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.agent.agentType !== "SUPER_ORCHESTRATOR") {
    return NextResponse.json({ error: "Only Super Agent may close threads" }, { status: 403 });
  }

  const { id: threadId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const result = await closeAgentChatThread({
    organizationId: auth.organizationId,
    threadId,
    closingAgentId: auth.agent.id,
    summaryMarkdown: parsed.data.summaryMarkdown,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}

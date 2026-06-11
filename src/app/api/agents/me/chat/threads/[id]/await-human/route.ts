import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { awaitHumanInputOnThread } from "@/lib/agent-chat";

type RouteParams = { params: Promise<{ id: string }> };

const awaitSchema = z.object({
  promptMarkdown: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = awaitSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const result = await awaitHumanInputOnThread({
    organizationId: auth.organizationId,
    threadId,
    agentId: auth.agent.id,
    promptMarkdown: parsed.data.promptMarkdown,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}

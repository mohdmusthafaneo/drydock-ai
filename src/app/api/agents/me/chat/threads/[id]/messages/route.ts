import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { postAgentThreadMessage } from "@/lib/agent-chat";

type RouteParams = { params: Promise<{ id: string }> };

const messageSchema = z.object({
  contentMarkdown: z.string().min(1).max(8000),
  reasoningJson: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const runId = request.headers.get("x-run-id");
  if (runId) {
    const run = await prisma.agentHeartbeatRun.findFirst({
      where: {
        id: runId,
        agentId: auth.agent.id,
        organizationId: auth.organizationId,
        status: "running",
      },
    });
    if (!run) {
      return NextResponse.json(
        { error: "Invalid or inactive heartbeat run" },
        { status: 400 },
      );
    }
  }

  const result = await postAgentThreadMessage({
    organizationId: auth.organizationId,
    threadId,
    authorAgentId: auth.agent.id,
    contentMarkdown: parsed.data.contentMarkdown,
    runId: runId ?? undefined,
    reasoningJson: parsed.data.reasoningJson,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}

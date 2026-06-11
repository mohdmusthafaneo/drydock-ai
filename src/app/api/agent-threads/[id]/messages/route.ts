import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { postHumanChatMessage } from "@/lib/agent-chat";

type RouteParams = { params: Promise<{ id: string }> };

const messageSchema = z.object({
  content: z.string().min(1).max(8000),
  targetAgentId: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await params;

  try {
    const body = messageSchema.parse(await request.json());
    const result = await postHumanChatMessage({
      organizationId: session.organizationId,
      userId: session.userId,
      threadId,
      content: body.content,
      targetAgentId: body.targetAgentId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: result.data.messageId,
      wakeupId: result.data.wakeupId,
      coalesced: result.data.coalesced,
    });
  } catch {
    return NextResponse.json({ error: "Invalid message data" }, { status: 400 });
  }
}

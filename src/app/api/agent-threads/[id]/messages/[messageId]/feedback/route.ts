import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

const feedbackSchema = z.object({
  feedback: z.enum(["thumbs_up", "thumbs_down"]),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId, messageId } = await params;

  let body: z.infer<typeof feedbackSchema>;
  try {
    body = feedbackSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid feedback value" }, { status: 400 });
  }

  // Verify the message belongs to this org and is an assistant message
  const message = await prisma.agentChatMessage.findFirst({
    where: {
      id: messageId,
      threadId,
      organizationId: session.organizationId,
      kind: "assistant",
    },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  await prisma.agentChatMessage.update({
    where: { id: messageId },
    data: { feedback: body.feedback },
  });

  return NextResponse.json({ ok: true });
}

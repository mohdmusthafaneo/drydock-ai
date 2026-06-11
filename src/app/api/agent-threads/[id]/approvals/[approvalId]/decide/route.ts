import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { decideApproval } from "@/lib/approvals/decide";
import { parseApprovalChatContext } from "@/lib/approvals/chat-context";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string; approvalId: string }> };

const decideSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "MODIFIED"]),
  comment: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId, approvalId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = decideSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, organizationId: session.organizationId },
  });

  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  const chatContext = parseApprovalChatContext(approval.payloadJson);
  if (chatContext?.threadId && chatContext.threadId !== threadId) {
    return NextResponse.json(
      { error: "Approval does not belong to this thread" },
      { status: 403 },
    );
  }

  const linkedMessage = await prisma.agentChatMessage.findFirst({
    where: {
      organizationId: session.organizationId,
      threadId,
      approvalId,
    },
    select: { id: true },
  });

  if (!chatContext?.threadId && !linkedMessage) {
    return NextResponse.json(
      { error: "Approval is not linked to this thread" },
      { status: 403 },
    );
  }

  const result = await decideApproval({
    organizationId: session.organizationId,
    userId: session.userId,
    userRole: session.role,
    approvalId,
    decision: parsed.data.decision,
    comment: parsed.data.comment,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

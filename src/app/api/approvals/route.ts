import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { decideApproval } from "@/lib/approvals/decide";

const schema = z.object({
  approvalId: z.string(),
  decision: z.enum(["APPROVED", "REJECTED", "MODIFIED"]),
  comment: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());

    const result = await decideApproval({
      organizationId: session.organizationId,
      userId: session.userId,
      userRole: session.role,
      approvalId: body.approvalId,
      decision: body.decision,
      comment: body.comment,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

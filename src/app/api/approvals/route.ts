import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { decideApproval } from "@/lib/approvals/decide";

const schema = z
  .object({
    approvalId: z.string(),
    decision: z.enum(["APPROVED", "REJECTED", "MODIFIED"]),
    comment: z.string().optional(),
  })
  .superRefine((body, ctx) => {
    if (
      (body.decision === "REJECTED" || body.decision === "MODIFIED") &&
      !body.comment?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A comment is required when rejecting or requesting modification",
        path: ["comment"],
      });
    }
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
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.issues[0]?.message ?? "Invalid request";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canApproveRequiredRole } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { enqueueApprovalFollowUpWakeups } from "@/lib/agent-control-plane/wakeup";

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

    const approval = await prisma.approval.findFirst({
      where: {
        id: body.approvalId,
        organizationId: session.organizationId,
      },
      include: { recommendation: true },
    });

    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    if (
      !canApproveRequiredRole(session.role, approval.recommendation.requiredRole ?? undefined)
    ) {
      return NextResponse.json(
        {
          error: approval.recommendation.requiredRole
            ? `This approval requires ${approval.recommendation.requiredRole.replace(/_/g, " ")} role`
            : "You do not have permission to approve this recommendation",
        },
        { status: 403 },
      );
    }

    const recStatus =
      body.decision === "APPROVED"
        ? "APPROVED"
        : body.decision === "REJECTED"
          ? "REJECTED"
          : "MODIFIED";

    await prisma.$transaction(async (tx) => {
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          approverId: session.userId,
          decision: body.decision,
          comment: body.comment,
          decidedAt: new Date(),
          riskScore: approval.recommendation.confidence,
        },
      });

      await tx.recommendation.update({
        where: { id: approval.recommendationId },
        data: { status: recStatus },
      });

      await tx.activityEvent.create({
        data: {
          organizationId: session.organizationId,
          type: "approval.decided",
          title: `Recommendation ${body.decision.toLowerCase()}`,
          description: approval.recommendation.title,
          metadataJson: JSON.stringify({ decision: body.decision }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: `recommendation.${body.decision.toLowerCase()}`,
          entityType: "Recommendation",
          entityId: approval.recommendationId,
          metadataJson: JSON.stringify({ comment: body.comment }),
        },
      });

      const releaseId = approval.recommendation.releaseId;
      if (releaseId) {
        const releaseApprovals = await tx.approval.findMany({
          where: {
            organizationId: session.organizationId,
            recommendation: { releaseId },
          },
          include: { recommendation: true },
        });

        const pending = releaseApprovals.filter((a) => !a.decision);
        if (pending.length === 0) {
          const anyRejected = releaseApprovals.some((a) => a.decision === "REJECTED");
          const allApproved = releaseApprovals.every((a) => a.decision === "APPROVED");

          await tx.release.update({
            where: { id: releaseId },
            data: {
              status: anyRejected ? "BLOCKED" : allApproved ? "APPROVED" : "PENDING_APPROVAL",
            },
          });
        }
      }
    });

    await enqueueApprovalFollowUpWakeups(
      session.organizationId,
      approval.id,
      body.decision,
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

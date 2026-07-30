import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";
import { canApproveRequiredRole } from "@/lib/permissions";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";

export type DecideApprovalInput = {
  organizationId: string;
  userId: string;
  userRole: UserRole;
  approvalId: string;
  decision: "APPROVED" | "REJECTED" | "MODIFIED";
  comment?: string;
};

export type DecideApprovalResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function decideApproval(
  input: DecideApprovalInput,
): Promise<DecideApprovalResult> {
  const { organizationId, userId, userRole, approvalId, decision, comment } =
    input;

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, organizationId },
    include: { recommendation: true },
  });

  if (!approval) {
    return { ok: false, error: "Approval not found", status: 404 };
  }

  if (approval.decision) {
    return { ok: false, error: "Approval already decided", status: 409 };
  }

  // Legacy agent-action approvals (no longer created) — still decidable.
  if (approval.type === "AGENT_ACTION") {
    const payload = parseActionPayload(approval.payloadJson);
    const requiredRole = payload.requiredRole;

    if (!canApproveRequiredRole(userRole, requiredRole)) {
      return {
        ok: false,
        error: requiredRole
          ? `This approval requires ${requiredRole.replace(/_/g, " ")} role`
          : "You do not have permission to approve this action",
        status: 403,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.approval.update({
        where: { id: approval.id },
        data: {
          approverId: userId,
          decision,
          comment,
          decidedAt: new Date(),
          riskScore: approval.riskScore,
        },
      });

      await tx.activityEvent.create({
        data: {
          organizationId,
          type: "approval.decided",
          title: `Agent action ${decision.toLowerCase()}`,
          description: approval.title ?? payload.action,
          metadataJson: JSON.stringify({ decision, approvalId: approval.id }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: `agent_action.${decision.toLowerCase()}`,
          entityType: "Approval",
          entityId: approval.id,
          metadataJson: JSON.stringify({ comment }),
        },
      });
    });

    invalidateExecutiveBriefingSnapshot(organizationId);
    return { ok: true };
  }

  if (!approval.recommendation) {
    return { ok: false, error: "Recommendation not found", status: 404 };
  }

  if (
    !canApproveRequiredRole(
      userRole,
      approval.recommendation.requiredRole ?? undefined,
    )
  ) {
    return {
      ok: false,
      error: approval.recommendation.requiredRole
        ? `This approval requires ${approval.recommendation.requiredRole.replace(/_/g, " ")} role`
        : "You do not have permission to approve this recommendation",
      status: 403,
    };
  }

  const recStatus =
    decision === "APPROVED"
      ? "APPROVED"
      : decision === "REJECTED"
        ? "REJECTED"
        : "MODIFIED";

  await prisma.$transaction(async (tx) => {
    await tx.approval.update({
      where: { id: approval.id },
      data: {
        approverId: userId,
        decision,
        comment,
        decidedAt: new Date(),
        riskScore: approval.recommendation!.confidence,
      },
    });

    await tx.recommendation.update({
      where: { id: approval.recommendationId! },
      data: { status: recStatus },
    });

    await tx.activityEvent.create({
      data: {
        organizationId,
        type: "approval.decided",
        title: `Recommendation ${decision.toLowerCase()}`,
        description: approval.recommendation!.title,
        metadataJson: JSON.stringify({ decision }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: `recommendation.${decision.toLowerCase()}`,
        entityType: "Recommendation",
        entityId: approval.recommendationId!,
        metadataJson: JSON.stringify({ comment }),
      },
    });

    const releaseId = approval.recommendation!.releaseId;
    if (releaseId) {
      const releaseApprovals = await tx.approval.findMany({
        where: {
          organizationId,
          recommendation: { releaseId },
        },
        include: { recommendation: true },
      });

      const pending = releaseApprovals.filter((a) => !a.decision);
      if (pending.length === 0) {
        const anyRejected = releaseApprovals.some(
          (a) => a.decision === "REJECTED",
        );
        const allApproved = releaseApprovals.every(
          (a) => a.decision === "APPROVED",
        );

        await tx.release.update({
          where: { id: releaseId },
          data: {
            status: anyRejected
              ? "BLOCKED"
              : allApproved
                ? "APPROVED"
                : "PENDING_APPROVAL",
          },
        });
      }
    }
  });

  invalidateExecutiveBriefingSnapshot(organizationId);
  return { ok: true };
}

function parseActionPayload(payloadJson: unknown): {
  action?: string;
  requiredRole?: UserRole;
} {
  const parsed = readJsonField<Record<string, unknown>>(payloadJson, {});
  return {
    action: typeof parsed.action === "string" ? parsed.action : undefined,
    requiredRole:
      typeof parsed.requiredRole === "string"
        ? (parsed.requiredRole as UserRole)
        : undefined,
  };
}

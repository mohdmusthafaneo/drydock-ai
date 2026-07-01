import { prisma } from "@/lib/prisma";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { rowToComplianceFindingView } from "@/lib/compliance/load-findings";
import type { ComplianceFindingView } from "@/lib/compliance/types";

export type ComplianceFindingAction = "resolve" | "dismiss" | "acknowledge";

function parseDetailJson(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function isDismissedFinding(detailJson: string): boolean {
  const detail = parseDetailJson(detailJson);
  return detail.manualAction === "dismiss";
}

export function isAcknowledgedFinding(detailJson: string): boolean {
  const detail = parseDetailJson(detailJson);
  return typeof detail.acknowledgedAt === "string";
}

export async function mutateComplianceFinding(input: {
  organizationId: string;
  findingId: string;
  action: ComplianceFindingAction;
  userId: string;
}): Promise<ComplianceFindingView | null> {
  const existing = await prisma.complianceFinding.findFirst({
    where: {
      id: input.findingId,
      organizationId: input.organizationId,
    },
  });

  if (!existing) return null;

  const now = new Date();
  const detail = parseDetailJson(existing.detailJson);
  const nowIso = now.toISOString();

  if (input.action === "acknowledge") {
    const updated = await prisma.complianceFinding.update({
      where: { id: existing.id },
      data: {
        detailJson: JSON.stringify({
          ...detail,
          acknowledgedAt: nowIso,
          acknowledgedBy: input.userId,
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "compliance.finding.acknowledged",
        entityType: "ComplianceFinding",
        entityId: existing.id,
        metadataJson: JSON.stringify({ ruleKey: existing.ruleKey, severity: existing.severity }),
      },
    });

    return rowToComplianceFindingView(updated);
  }

  const manualAction = input.action === "dismiss" ? "dismiss" : "resolve";
  const updated = await prisma.complianceFinding.update({
    where: { id: existing.id },
    data: {
      status: "resolved",
      resolvedAt: now,
      detailJson: JSON.stringify({
        ...detail,
        manualAction,
        manualResolvedAt: nowIso,
        manualResolvedBy: input.userId,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      action:
        input.action === "dismiss"
          ? "compliance.finding.dismissed"
          : "compliance.finding.resolved",
      entityType: "ComplianceFinding",
      entityId: existing.id,
      metadataJson: JSON.stringify({ ruleKey: existing.ruleKey, severity: existing.severity }),
    },
  });

  invalidateExecutiveBriefingSnapshot(input.organizationId);

  return rowToComplianceFindingView(updated);
}

/**
 * Record an architect ruling. Reason carries scope.
 */

import { prisma } from "@/lib/prisma";
import { RULING_REASONS } from "@/lib/drydock/types";
import type { RulingReasonCode } from "@/generated/prisma/client";

const CODE_MAP: Record<string, RulingReasonCode> = {
  intentional_this_test: "INTENTIONAL_THIS_TEST",
  correct_for_kind: "CORRECT_FOR_KIND",
  required_by_integration: "REQUIRED_BY_INTEGRATION",
  known_being_fixed: "KNOWN_BEING_FIXED",
  accepted_risk: "ACCEPTED_RISK",
  finding_wrong: "FINDING_WRONG",
};

function scopeFor(code: string): string {
  const row = RULING_REASONS.find((r) => r.code === code);
  return row?.scope ?? "Custom scope";
}

export async function recordRuling(args: {
  organizationId: string;
  findingId: string;
  reasonCode: string;
  customReason?: string;
}) {
  const finding = await prisma.finding.findFirst({
    where: { id: args.findingId, organizationId: args.organizationId },
  });
  if (!finding) {
    throw new Error("Finding not found");
  }

  const dbCode = CODE_MAP[args.reasonCode] ?? "CUSTOM";
  const expiresAt =
    dbCode === "ACCEPTED_RISK" || dbCode === "KNOWN_BEING_FIXED"
      ? new Date(Date.now() + 14 * 86_400_000)
      : null;

  const ruling = await prisma.$transaction(async (tx) => {
    const created = await tx.ruling.create({
      data: {
        organizationId: args.organizationId,
        findingId: finding.id,
        reasonCode: dbCode,
        customReason: args.customReason ?? null,
        scopeSummary: scopeFor(args.reasonCode),
        expiresAt,
      },
    });

    // "finding wrong" is a defect report — resolve without teaching the Standard
    const status = dbCode === "FINDING_WRONG" ? "RESOLVED" : "RULED";
    await tx.finding.update({
      where: { id: finding.id },
      data: {
        status,
        resolvedAt: new Date(),
      },
    });

    return created;
  });

  return ruling;
}

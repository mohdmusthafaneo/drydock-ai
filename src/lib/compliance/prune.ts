import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const HISTORY_WINDOW_DAYS = 90;

function sinceDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isMissingComplianceTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" ||
      error.message.includes("ComplianceFinding") ||
      error.message.includes("ComplianceRuleState"))
  );
}

export async function pruneOldComplianceFindings(organizationId: string): Promise<void> {
  try {
    const cutoff = sinceDate(HISTORY_WINDOW_DAYS);
    await prisma.complianceFinding.deleteMany({
      where: {
        organizationId,
        status: "resolved",
        resolvedAt: { lt: cutoff },
      },
    });
  } catch (error) {
    if (isMissingComplianceTables(error)) return;
    throw error;
  }
}

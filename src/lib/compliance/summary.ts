import { prisma } from "@/lib/prisma";
import type { ComplianceFindingSummary } from "@/lib/compliance/types";

export async function loadComplianceFindingSummary(
  organizationId: string,
): Promise<ComplianceFindingSummary> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [openFindings, latest, resolvedThisWeek] = await Promise.all([
    prisma.complianceFinding.findMany({
      where: { organizationId, status: "open" },
      select: { severity: true },
    }),
    prisma.complianceFinding.findFirst({
      where: { organizationId },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    }),
    prisma.complianceFinding.count({
      where: {
        organizationId,
        status: "resolved",
        resolvedAt: { gte: weekAgo },
      },
    }),
  ]);

  let criticalOpen = 0;
  let warningOpen = 0;
  let infoOpen = 0;

  for (const finding of openFindings) {
    if (finding.severity === "critical") criticalOpen += 1;
    else if (finding.severity === "warning") warningOpen += 1;
    else infoOpen += 1;
  }

  return {
    openCount: openFindings.length,
    criticalOpen,
    warningOpen,
    infoOpen,
    lastEvaluatedAt: latest?.lastSeenAt.toISOString() ?? null,
    resolvedThisWeek,
  };
}

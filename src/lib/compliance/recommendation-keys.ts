/** Prefix for compliance-finding recommendations — used for idempotent dedup. */
export function complianceRecommendationTitle(
  findingId: string,
  title: string,
): string {
  return `[compliance:${findingId}] ${title}`;
}

export function parseComplianceFindingIdFromTitle(
  title: string,
): string | null {
  const match = title.match(/^\[compliance:([^\]]+)\]/);
  return match?.[1] ?? null;
}

/** Finding ids that already have a non-rejected compliance recommendation. */
export async function loadPendingComplianceFindingIds(
  organizationId: string,
): Promise<Set<string>> {
  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.recommendation.findMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "APPROVED", "MODIFIED"] },
      title: { startsWith: "[compliance:" },
    },
    select: { title: true },
  });

  const ids = new Set<string>();
  for (const row of existing) {
    const findingId = parseComplianceFindingIdFromTitle(row.title);
    if (findingId) ids.add(findingId);
  }
  return ids;
}

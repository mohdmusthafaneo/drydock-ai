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

export async function loadPendingComplianceFindingIds(
  organizationId: string,
): Promise<Set<string>> {
  const { prisma } = await import("@/lib/prisma");
  const pending = await prisma.recommendation.findMany({
    where: {
      organizationId,
      status: "PENDING",
      title: { startsWith: "[compliance:" },
    },
    select: { title: true },
  });

  const ids = new Set<string>();
  for (const row of pending) {
    const findingId = parseComplianceFindingIdFromTitle(row.title);
    if (findingId) ids.add(findingId);
  }
  return ids;
}

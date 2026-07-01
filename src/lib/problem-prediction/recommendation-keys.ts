/** Prefix for problem-prediction recommendations — used for idempotent dedup. */
export function predictionRecommendationTitle(
  predictionId: string,
  title: string,
): string {
  return `[prediction:${predictionId}] ${title}`;
}

export function parsePredictionIdFromTitle(title: string): string | null {
  const match = title.match(/^\[prediction:([^\]]+)\]/);
  return match?.[1] ?? null;
}

export async function loadPendingPredictionIds(
  organizationId: string,
): Promise<Set<string>> {
  const { prisma } = await import("@/lib/prisma");
  const pending = await prisma.recommendation.findMany({
    where: {
      organizationId,
      status: "PENDING",
      title: { startsWith: "[prediction:" },
    },
    select: { title: true },
  });

  const ids = new Set<string>();
  for (const row of pending) {
    const predictionId = parsePredictionIdFromTitle(row.title);
    if (predictionId) ids.add(predictionId);
  }
  return ids;
}

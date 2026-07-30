import { prisma } from "@/lib/prisma";
import { asJsonInput } from "@/lib/json-field";
import { SETUP_RECOMMENDATION_TITLES } from "@/lib/recommendation-queue";

/**
 * Auto-reject setup recommendations that contradict live Integration /
 * Delivery DNA state (e.g. "Connect Jira" while Jira is CONNECTED).
 */
export async function dismissStaleSetupRecommendations(
  organizationId: string,
): Promise<{ dismissed: number }> {
  const [integrations, dna, pending] = await Promise.all([
    prisma.integration.findMany({
      where: { organizationId, status: "CONNECTED" },
      select: { provider: true },
    }),
    prisma.deliveryDNA.findUnique({
      where: { organizationId },
      select: { autonomyMode: true },
    }),
    prisma.recommendation.findMany({
      where: {
        organizationId,
        status: "PENDING",
        OR: [
          { queue: "SETUP" },
          { title: { in: [...SETUP_RECOMMENDATION_TITLES] } },
        ],
      },
      select: { id: true, title: true },
    }),
  ]);

  if (pending.length === 0) return { dismissed: 0 };

  const providers = new Set(integrations.map((i) => i.provider));
  const jiraOk = providers.has("JIRA");
  const githubOk = providers.has("GITHUB");
  const grafanaOk = providers.has("GRAFANA");
  const prometheusOk = providers.has("PROMETHEUS");
  const autonomyRecommend =
    !dna?.autonomyMode || dna.autonomyMode === "RECOMMEND";

  const toDismiss = pending.filter((rec) => {
    if (rec.title === "Connect Jira for workflow intelligence") return jiraOk;
    if (rec.title === "Connect GitHub for change-risk signals") return githubOk;
    if (rec.title === "Add Grafana observability connector") return grafanaOk;
    if (rec.title === "Connect Prometheus for metric KPIs") return prometheusOk;
    if (rec.title === "Enable human-governed recommendation loop") {
      return autonomyRecommend;
    }
    return false;
  });

  if (toDismiss.length === 0) return { dismissed: 0 };

  const ids = toDismiss.map((r) => r.id);
  const openApprovals = await prisma.approval.findMany({
    where: {
      organizationId,
      recommendationId: { in: ids },
      decision: null,
    },
    select: { id: true },
  });

  await prisma.$transaction([
    ...openApprovals.map((a) =>
      prisma.approval.update({
        where: { id: a.id },
        data: {
          decision: "REJECTED",
          comment: "Auto-dismissed — integration/DNA already satisfies this setup item",
          decidedAt: new Date(),
          payloadJson: asJsonInput({ systemDismissal: true }),
        },
      }),
    ),
    prisma.recommendation.updateMany({
      where: { id: { in: ids } },
      data: { status: "REJECTED" },
    }),
  ]);

  return { dismissed: ids.length };
}

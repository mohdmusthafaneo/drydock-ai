import { deliveryAnalysisForFilters } from "@/lib/delivery-analysis/resolve";
import type { StoredJiraDelivery } from "@/lib/delivery-analysis/resolve";
import {
  buildTrendFromHistory,
  computeKpiDeltas,
  loadDeliveryAnalysisHistory,
  priorKpisFromHistory,
  scopedKpisFromSnapshot,
} from "@/lib/delivery-analysis/persist";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisSnapshot,
  DeliveryAnalysisTrendPoint,
} from "@/lib/delivery-analysis/types";

export async function enrichDeliverySnapshot(
  organizationId: string,
  stored: StoredJiraDelivery,
  filters: DeliveryAnalysisFilters,
): Promise<DeliveryAnalysisSnapshot> {
  const snapshot = deliveryAnalysisForFilters(stored, filters);
  const historyRows = await loadDeliveryAnalysisHistory(organizationId, filters.range);
  const trend = buildTrendFromHistory(historyRows, filters.projectKey);

  if (filters.compare === "previous_sync" && historyRows.length >= 2) {
    const prior = priorKpisFromHistory(historyRows, filters.projectKey);
    if (prior) {
      const current = scopedKpisFromSnapshot(snapshot, filters.projectKey);
      const deltas = computeKpiDeltas(current, prior);
      return {
        ...snapshot,
        trend,
        kpis: { ...snapshot.kpis, ...deltas },
      };
    }
  }

  return { ...snapshot, trend };
}

export async function getDeliveryAnalysisTrend(
  organizationId: string,
  range: DeliveryAnalysisFilters["range"],
  projectKey: string | null,
): Promise<DeliveryAnalysisTrendPoint[]> {
  const historyRows = await loadDeliveryAnalysisHistory(organizationId, range);
  return buildTrendFromHistory(historyRows, projectKey);
}

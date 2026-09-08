import {
  getAvailableMockServiceScopes,
  getMockObservabilityAnalysisSnapshot,
} from "@/lib/store/mock/observability-snapshot";
import type { ObservabilityData } from "@/lib/store/types";

export {
  getAvailableMockServiceScopes,
  getMockObservabilityAnalysisSnapshot,
} from "@/lib/store/mock/observability-snapshot";

export const mockObservability: ObservabilityData = {
  snapshot: getMockObservabilityAnalysisSnapshot({
    serviceId: null,
    environment: "all",
    range: "30d",
    compare: "previous_sync",
    riskFocus: "all",
  }),
  availableServiceScopes: getAvailableMockServiceScopes().map((scope) => ({
    id: scope.id,
    name: scope.label,
    environment: scope.environment,
  })),
};

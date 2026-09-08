import type { AppData } from "@/lib/store/types";
import { MOCK_DIMENSIONS, OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
import { buildMockOverview } from "@/lib/store/mock/overview";
import { mockAttention } from "@/lib/store/mock/attention";
import { mockApprovals } from "@/lib/store/mock/approvals";
import { mockLedger } from "@/lib/store/mock/ledger";
import { mockBriefing } from "@/lib/store/mock/briefing";
import { mockCertificate } from "@/lib/store/mock/certificate";
import { mockStandard } from "@/lib/store/mock/standard";
import { mockEscapes } from "@/lib/store/mock/escapes";
import { mockQa } from "@/lib/store/mock/qa";
import { mockCodeAnalysis } from "@/lib/store/mock/code-analysis";
import { mockDeliveryAnalysis } from "@/lib/store/mock/delivery-analysis";
import { mockObservability } from "@/lib/store/mock/observability";
import { mockGovernance } from "@/lib/store/mock/governance";
import { mockReleases } from "@/lib/store/mock/releases";
import { mockIntegrations } from "@/lib/store/mock/integrations";
import { mockAudit } from "@/lib/store/mock/audit";
import { mockSettings } from "@/lib/store/mock/settings";
import { mockReports } from "@/lib/store/mock/reports";
import { mockRisk } from "@/lib/store/mock/risk";

export function getMockAppData(): AppData {
  return {
    meta: {
      lastSyncAt: OVERVIEW_LAST_SYNC_AT,
      mode: "mock",
      provenance: {},
    },
    org: { id: "mock-connexus", name: "Connexus" },
    user: { name: "Krishna", greetingName: "Krishna", role: "ADMIN" },
    dimensions: MOCK_DIMENSIONS,
    overview: buildMockOverview(),
    attention: mockAttention,
    approvals: mockApprovals,
    ledger: mockLedger,
    briefing: mockBriefing,
    certificate: mockCertificate,
    standard: mockStandard,
    escapes: mockEscapes,
    qa: mockQa,
    codeAnalysis: mockCodeAnalysis,
    deliveryAnalysis: mockDeliveryAnalysis,
    observability: mockObservability,
    governance: mockGovernance,
    releases: mockReleases,
    integrations: mockIntegrations,
    audit: mockAudit,
    settings: mockSettings,
    reports: mockReports,
    risk: mockRisk,
  };
}

export { MOCK_DIMENSIONS, OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
export { buildMockOverview } from "@/lib/store/mock/overview";

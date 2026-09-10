import type { AppData } from "@/lib/store/types";
import { buildMockDimensions } from "@/lib/store/mock/dimensions";
import { buildMockOverviewFromDerived } from "@/lib/store/mock/overview";
import { mockAttention } from "@/lib/store/mock/attention";
import { mockApprovals } from "@/lib/store/mock/approvals";
import { mockLedger } from "@/lib/store/mock/ledger";
import { mockBriefing } from "@/lib/store/mock/briefing";
import { mockCertificate } from "@/lib/store/mock/certificate";
import { mockStandard } from "@/lib/store/mock/standard";
import { mockEscapes } from "@/lib/store/mock/escapes";
import { mockQa } from "@/lib/store/mock/qa";
import { mockCodeAnalysis } from "@/lib/store/mock/code-analysis";
import { buildMockDeliveryAnalysisFromDerived } from "@/lib/store/mock/delivery-analysis";
import { mockObservability } from "@/lib/store/mock/observability";
import { mockGovernance } from "@/lib/store/mock/governance";
import { mockReleases } from "@/lib/store/mock/releases";
import { buildMockIntegrations } from "@/lib/store/mock/integrations";
import { mockAudit } from "@/lib/store/mock/audit";
import {
  buildMockSettings,
  CONNEXUS_SETTINGS_MEMBERS,
} from "@/lib/store/mock/settings";
import { mockReports } from "@/lib/store/mock/reports";
import { mockRisk } from "@/lib/store/mock/risk";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import { CONNEXUS_OVERVIEW_DERIVED } from "@/lib/store/mock/connexus-overview-derived";
import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";

export const TPT_DEMO_EMAIL = "tpt@neoito.com";
export const CONNEXUS_DEMO_EMAIL = "connexus@neoito.com";

const TPT_PACK = TPT_OVERVIEW_DERIVED as unknown as OverviewDerivedPack;
const CONNEXUS_PACK =
  CONNEXUS_OVERVIEW_DERIVED as unknown as OverviewDerivedPack;

const CONNEXUS_REPOS = [
  {
    id: "connexus-platform",
    name: "connexus-platform",
    fullName: "neoito/connexus-platform",
  },
] as const;

const CONNEXUS_SERVICES = [
  { id: "connexus-api", name: "connexus-api" },
  { id: "connexus-web", name: "connexus-web" },
] as const;

function assembleSeed(input: {
  org: AppData["org"];
  user: AppData["user"];
  derived: OverviewDerivedPack;
  dimensions: AppData["dimensions"];
  settings: AppData["settings"];
}): AppData {
  return {
    meta: {
      lastSyncAt: input.derived.lastSyncAt,
    },
    org: input.org,
    user: input.user,
    dimensions: input.dimensions,
    overview: buildMockOverviewFromDerived(input.derived),
    attention: mockAttention,
    approvals: mockApprovals,
    ledger: mockLedger,
    briefing: mockBriefing,
    certificate: mockCertificate,
    standard: mockStandard,
    escapes: mockEscapes,
    qa: mockQa,
    codeAnalysis: mockCodeAnalysis,
    deliveryAnalysis: buildMockDeliveryAnalysisFromDerived(input.derived),
    observability: mockObservability,
    governance: mockGovernance,
    releases: mockReleases,
    integrations: buildMockIntegrations(input.derived),
    audit: mockAudit,
    settings: input.settings,
    reports: mockReports,
    risk: mockRisk,
  };
}

/** TPT Platform Overview mock (Jira TP export). */
export function seedTptAppData(): AppData {
  return assembleSeed({
    org: { id: "org-tpt", name: "TPT Platform" },
    user: { name: "Krishna Nair", greetingName: "Krishna", role: "ORG_ADMIN" },
    derived: TPT_PACK,
    dimensions: buildMockDimensions(TPT_PACK),
    settings: buildMockSettings(TPT_PACK),
  });
}

/** Connexus Overview mock (Jira CX export, single team). */
export function seedConnexusAppData(): AppData {
  return assembleSeed({
    org: { id: "org-connexus", name: "Connexus" },
    user: {
      name: "Connexus Admin",
      greetingName: "Connexus",
      role: "ORG_ADMIN",
    },
    derived: CONNEXUS_PACK,
    dimensions: buildMockDimensions(CONNEXUS_PACK, {
      repos: [...CONNEXUS_REPOS],
      services: [...CONNEXUS_SERVICES],
    }),
    settings: buildMockSettings(CONNEXUS_PACK, CONNEXUS_SETTINGS_MEMBERS),
  });
}

/**
 * Pick the demo mock pack by login email.
 * Unknown accounts keep the TPT seed (backward compatible).
 */
export function resolveMockSeed(input: { email: string }): AppData {
  const email = input.email.trim().toLowerCase();
  if (email === CONNEXUS_DEMO_EMAIL) {
    return seedConnexusAppData();
  }
  return seedTptAppData();
}

/** @deprecated Prefer resolveMockSeed / seedTptAppData. */
export function seedAppData(): AppData {
  return seedTptAppData();
}

export { MOCK_DIMENSIONS, OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
export { buildMockOverview } from "@/lib/store/mock/overview";

import type { UserRole } from "@/generated/prisma/client";
import type { RecommendationApprovalData } from "@/components/approvals/recommendation-approval-card";
import type { CodeAnalysisSnapshot } from "@/lib/code-analysis/types";
import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import type { CertificateView } from "@/lib/drydock/certificate";
import type { EscapeView } from "@/lib/drydock/escapes";
import type { MockBriefing, MockLedger } from "@/lib/drydock/types";
import type { StandardView } from "@/lib/drydock/standard";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import type { OverviewDashboardModel, OverviewSprintOption } from "@/lib/overview/types";
import type { AppFilters, Dimensioned } from "@/lib/store/dimensions";

export type AttentionQueueItem = {
  id: string;
  title: string;
  reason: string;
  originatingDecision: string;
  href: string;
  tone: "danger" | "warning" | "info";
};

export type DataMode = "mock" | "live" | "hybrid";
export type ProvenanceKind = "mock" | "live";

export type AppDataMeta = {
  lastSyncAt: string | null;
  mode: DataMode;
  /** Dotted paths supplied by the live overlay. */
  provenance: Record<string, ProvenanceKind>;
};

export type AppTeam = { key: string; name: string };
export type AppProject = { key: string; name: string };
export type AppRepo = { id: string; name: string; fullName?: string };
export type AppService = { id: string; name: string };

export type AppDimensions = {
  teams: AppTeam[];
  sprints: OverviewSprintOption[];
  projects: AppProject[];
  repos: AppRepo[];
  services: AppService[];
};

/** Filter-aware overview leaf (greeting/sprint/teams come from dimensions + user). */
export type OverviewLeaf = {
  deliveryConfidence: OverviewDashboardModel["deliveryConfidence"];
  keyTakeaways: OverviewDashboardModel["keyTakeaways"];
  pillars: OverviewDashboardModel["pillars"];
  deliveryTrend: OverviewDashboardModel["deliveryTrend"];
  burndown: OverviewDashboardModel["burndown"];
  heatmap: OverviewDashboardModel["heatmap"];
  attention: OverviewDashboardModel["attention"];
  leadership: OverviewDashboardModel["leadership"];
  empty: boolean;
};

export type OverviewData = Dimensioned<OverviewLeaf>;

export type AttentionData = {
  items: AttentionQueueItem[];
};

export type ApprovalsData = {
  pending: Array<{
    approvalId: string;
    riskScore: number;
    recommendation: RecommendationApprovalData;
  }>;
  hero: { headline: string; subcopy: string };
  decisionHistory: Array<{
    id: string;
    title: string;
    decision: string;
    decidedAt: string;
    decidedBy: string;
  }>;
};

export type LedgerData = MockLedger;
export type BriefingData = MockBriefing;
export type CertificateData = CertificateView;
export type StandardData = StandardView;
export type EscapesData = { items: EscapeView[] };

export type QaData = {
  /** Serialized page view from buildQaPageView — opaque for store stability. */
  view: unknown | null;
  empty: boolean;
};

export type CodeAnalysisData = {
  snapshot: CodeAnalysisSnapshot | null;
  availableRepos: string[];
  availableAuthors: string[];
  /** Per-team AI risk % used when aligning Overview claims. */
  aiRiskPctByTeam: Record<string, number>;
  defaultAiRiskPct: number;
};

export type DeliveryAnalysisData = {
  snapshot: DeliveryAnalysisSnapshot | null;
};

export type ObservabilityData = {
  snapshot: ObservabilityAnalysisSnapshot | null;
  availableServiceScopes: Array<{ id: string; name: string; environment?: string }>;
};

export type GovernanceData = {
  findings: unknown[];
  summary: unknown | null;
  hasDna: boolean;
  dnaSummary: string | null;
};

export type ReleaseListItem = {
  id: string;
  name: string;
  version: string | null;
  status: string;
  createdAt: string;
  certificateDecision: string | null;
  incidentCount: number;
};

/** Simplified release detail for store-backed `/releases/[id]` (not full Prisma joins). */
export type ReleaseDetailPayload = {
  id: string;
  name: string;
  version: string | null;
  status: string;
  environment: string;
  branch: string | null;
  serviceScope: string | null;
  jiraFixVersion: string | null;
  jiraSprintId: string | null;
  assessedAt: string | null;
  readinessScore: number | null;
  governanceRiskScore: number | null;
  riskLevel: string | null;
  primaryRecommendation: string | null;
  assessmentSummary: string | null;
  deployedAt: string | null;
  pendingApprovalCount: number;
  pendingRoles: string[];
  gateVerdict: "GO" | "HOLD" | "NO-GO" | null;
  verdictLabel: string;
  headline: string;
  subcopy: string;
  detailNotes: string[];
};

export type ReleasesData = {
  items: ReleaseListItem[];
  /** Detail payloads keyed by release id (optional; live overlay fills). */
  byId: Record<string, ReleaseDetailPayload | unknown>;
};

export type IntegrationsData = {
  items: Array<{
    id: string;
    provider: string;
    status: string;
    lastSyncAt: string | null;
  }>;
};

export type AuditData = {
  logs: Array<{
    id: string;
    action: string;
    category: string;
    summary: string;
    createdAt: string;
    actorName: string | null;
  }>;
};

export type SettingsData = {
  organizationName: string;
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
};

export type ReportsData = {
  available: boolean;
  title: string;
  description: string;
  sections: Array<{ id: string; title: string; body: string }>;
};

export type RiskData = {
  available: boolean;
  title: string;
  description: string;
  items: Array<{
    id: string;
    title: string;
    severity: "high" | "medium" | "low";
    summary: string;
    href?: string;
  }>;
};

/**
 * Canonical UI dataset. Every surface reads from here.
 * Domain leaves reuse existing model types where possible.
 */
export type AppData = {
  meta: AppDataMeta;
  org: { id: string; name: string };
  user: { name: string; greetingName: string; role: UserRole | string };
  dimensions: AppDimensions;
  overview: OverviewData;
  attention: AttentionData;
  approvals: ApprovalsData;
  ledger: LedgerData;
  briefing: BriefingData;
  certificate: CertificateData;
  standard: StandardData;
  escapes: EscapesData;
  qa: QaData;
  codeAnalysis: CodeAnalysisData;
  deliveryAnalysis: DeliveryAnalysisData;
  observability: ObservabilityData;
  governance: GovernanceData;
  releases: ReleasesData;
  integrations: IntegrationsData;
  audit: AuditData;
  settings: SettingsData;
  reports: ReportsData;
  risk: RiskData;
};

export type StoreStatus = "idle" | "loading" | "ready" | "error";

export type AppStoreState = {
  data: AppData;
  filters: AppFilters;
  status: StoreStatus;
  error: string | null;
};

export type { AppFilters, OverviewDashboardModel, OverviewSprintOption };

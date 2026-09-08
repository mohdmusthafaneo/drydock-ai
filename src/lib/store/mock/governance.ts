import type { ComplianceFindingSummary, ComplianceFindingView } from "@/lib/compliance/types";
import type { GovernanceData } from "@/lib/store/types";

const mockFindings: ComplianceFindingView[] = [
  {
    id: "finding-blocked-owners",
    ruleKey: "jira.blocked_without_owner",
    severity: "critical",
    status: "open",
    targetType: "org",
    targetExternalId: "connexus",
    projectKey: "WEB",
    title: "Blocked issues lack owner and ETA",
    detail: { count: 30, sprintId: "37" },
    entityLabel: "Sprint 37 blocked backlog",
    entityUrl: "/delivery-analysis?riskFocus=blockers",
    repo: null,
    firstSeenAt: "2026-08-18T08:00:00.000Z",
    lastSeenAt: "2026-08-24T10:30:00.000Z",
    resolvedAt: null,
  },
  {
    id: "finding-coverage-gap",
    ruleKey: "qa.coverage_gap",
    severity: "warning",
    status: "open",
    targetType: "pull_request",
    targetExternalId: "pr-1842",
    projectKey: "WEB",
    title: "Critical path lacks regression coverage",
    detail: { suite: "checkout", missing: 4 },
    entityLabel: "PR #1842",
    entityUrl: null,
    repo: "connexus/web",
    firstSeenAt: "2026-08-21T14:00:00.000Z",
    lastSeenAt: "2026-08-24T09:00:00.000Z",
    resolvedAt: null,
  },
  {
    id: "finding-policy-ack",
    ruleKey: "governance.policy_ack",
    severity: "info",
    status: "open",
    targetType: "org",
    targetExternalId: "connexus",
    projectKey: null,
    title: "Governance policy last reviewed over 90 days ago",
    detail: { lastReviewedAt: "2026-05-01T00:00:00.000Z" },
    entityLabel: "Governance policy",
    entityUrl: "/governance/policy",
    repo: null,
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-24T08:00:00.000Z",
    resolvedAt: null,
  },
];

const mockSummary: ComplianceFindingSummary = {
  openCount: 3,
  criticalOpen: 1,
  warningOpen: 1,
  infoOpen: 1,
  lastEvaluatedAt: "2026-08-24T10:30:00.000Z",
  resolvedThisWeek: 2,
};

export const mockGovernance: GovernanceData = {
  findings: mockFindings,
  summary: mockSummary,
  hasDna: true,
  dnaSummary:
    "Connexus Delivery DNA: staged autonomy with human approval on release gates. Risk threshold 40%. Workflow mode: gated.",
};

import type { ReleaseDetailPayload, ReleasesData } from "@/lib/store/types";

const sprint37Detail: ReleaseDetailPayload = {
  id: "fixture-release-37",
  name: "Sprint 37 release",
  version: "37.0.0",
  status: "PENDING_APPROVAL",
  environment: "staging",
  branch: "release/37",
  serviceScope: "WEB",
  jiraFixVersion: null,
  jiraSprintId: "37",
  assessedAt: "2026-08-20T14:00:00.000Z",
  readinessScore: 62,
  governanceRiskScore: 48,
  riskLevel: "medium",
  primaryRecommendation: "HOLD",
  assessmentSummary:
    "Schedule risk and blocked backlog keep readiness below go threshold. Leadership approval required before controlled deploy.",
  deployedAt: null,
  pendingApprovalCount: 2,
  pendingRoles: ["Delivery Manager", "QA Lead"],
  gateVerdict: "HOLD",
  verdictLabel: "Override and proceed",
  headline: "Sprint 37 release awaits human sign-off",
  subcopy: "Readiness 62% · leadership approval required before deployment.",
  detailNotes: [
    "30 blocked issues lack owner and ETA (aligned with Overview attention).",
    "16 spillover candidates remain in the Sprint 37 evidence set.",
    "CI green on release/37; observability pairing healthy in demo mode.",
  ],
};

export const mockReleases: ReleasesData = {
  items: [
    {
      id: "fixture-release-37",
      name: "Sprint 37 release",
      version: "37.0.0",
      status: "PENDING_APPROVAL",
      createdAt: "2026-08-20T12:00:00.000Z",
      certificateDecision: null,
      incidentCount: 0,
    },
    {
      id: "fixture-release-37-hotfix",
      name: "Sprint 37 hotfix candidate",
      version: "37.0.1-rc.1",
      status: "DETECTED",
      createdAt: "2026-08-23T09:30:00.000Z",
      certificateDecision: null,
      incidentCount: 0,
    },
  ],
  byId: {
    "fixture-release-37": sprint37Detail,
  },
};

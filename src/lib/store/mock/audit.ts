import type { AuditData } from "@/lib/store/types";

export const mockAudit: AuditData = {
  logs: [
    {
      id: "audit-1",
      action: "OVERVIEW_VIEWED",
      category: "NAVIGATION",
      summary: "Opened Connexus Overview for Sprint 37",
      createdAt: "2026-08-24T10:45:00.000Z",
      actorName: "Krishna",
    },
    {
      id: "audit-2",
      action: "ATTENTION_SURFACED",
      category: "GOVERNANCE",
      summary: "Surfaced 30 blocked issues lacking owner and ETA",
      createdAt: "2026-08-24T09:12:00.000Z",
      actorName: null,
    },
    {
      id: "audit-3",
      action: "INTEGRATION_SYNCED",
      category: "INTEGRATION",
      summary: "Jira and GitHub sync completed for Connexus",
      createdAt: "2026-08-24T10:49:00.000Z",
      actorName: "System",
    },
    {
      id: "audit-4",
      action: "recommendation.approved",
      category: "GOVERNANCE",
      summary: "Approved hold on Sprint 37 release pending blocked-backlog owners",
      createdAt: "2026-08-23T16:20:00.000Z",
      actorName: "Priya",
    },
    {
      id: "audit-5",
      action: "release.assessed",
      category: "GOVERNANCE",
      summary: "Assessment refreshed for Sprint 37 release (readiness 62%)",
      createdAt: "2026-08-20T14:05:00.000Z",
      actorName: "System",
    },
  ],
};

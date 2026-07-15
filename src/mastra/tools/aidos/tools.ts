import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  JIRA_JQL_PRESETS,
  queryJiraJqlForOrganization,
} from "@/lib/agent-control-plane/tools/jira-tools";
import { buildReleaseAssessContext } from "@/lib/agent-control-plane/tools/release-tools";
import { resolveStoredCodeAnalysis } from "@/lib/code-analysis/sync";
import { loadComplianceFindings } from "@/lib/compliance/load-findings";
import { loadComplianceFindingSummary } from "@/lib/compliance/summary";
import { resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";
import {
  checkIntegrationHealth,
  summarizeIntegrationHealth,
} from "@/lib/integration-health";
import { summarizePortfolioHygiene } from "@/lib/jira-hygiene";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import {
  loadPredictionSummary,
  loadProblemPredictions,
} from "@/lib/problem-prediction/load-predictions";

import { getAidosToolContext } from "./context";

export const aidosGetOrgContextTool = createTool({
  id: "aidos_get_org_context",
  description:
    "Get a slim organization snapshot: DNA, workflow progress, integrations (no credentials), stats, and recent releases/recommendations/approvals/incidents.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const ctx = await getOrganizationContext(organizationId);
    if (!ctx.org) {
      return { ok: false, error: "Organization not found" };
    }

    const dna = ctx.dna
      ? {
          methodology: ctx.dna.workflowMode,
          approvalLevel: ctx.dna.approvalLevel,
          riskThreshold: ctx.dna.riskThreshold,
          autonomyMode: ctx.dna.autonomyMode,
          autonomyLevel: ctx.dna.autonomyLevel,
          governanceScore: ctx.dna.governanceScore,
          observabilityStrategy: ctx.dna.observabilityStrategy,
          summary: ctx.dna.summary,
        }
      : null;

    return {
      ok: true,
      org: {
        id: ctx.org.id,
        name: ctx.org.name,
        slug: ctx.org.slug,
      },
      dna,
      workflow: {
        configuredAt: ctx.workflow?.configuredAt?.toISOString() ?? null,
        executionStatus: ctx.workflow?.executionStatus ?? null,
        currentStepId: ctx.workflow?.currentStepId ?? null,
        completedStepIds: ctx.completedStepIds,
      },
      integrations: ctx.integrations.map((i) => ({
        provider: i.provider,
        status: i.status,
        lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      })),
      stats: ctx.stats,
      recent: {
        releases: ctx.releases.slice(0, 10).map((r) => ({
          id: r.id,
          name: r.name,
          version: r.version,
          status: r.status,
          readinessScore: r.readinessScore,
        })),
        recommendations: ctx.recommendations.slice(0, 10).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          impact: r.impact,
        })),
        approvals: ctx.approvals.slice(0, 10).map((a) => ({
          id: a.id,
          title: a.title ?? a.recommendation?.title ?? null,
          status: a.decision ?? "PENDING",
        })),
        incidents: ctx.incidents.slice(0, 10).map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          severityScore: i.severityScore,
        })),
      },
    };
  },
});

export const aidosListRecommendationsTool = createTool({
  id: "aidos_list_recommendations",
  description: "List governance recommendations for the organization.",
  inputSchema: z.object({
    status: z
      .enum(["PENDING", "APPROVED", "REJECTED", "MODIFIED"])
      .optional()
      .describe("Filter by recommendation status"),
    limit: z
      .number()
      .optional()
      .describe("Max recommendations to return (default 50, max 200)"),
  }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const limit = Math.min(input.limit ?? 50, 200);
    const recommendations = await prisma.recommendation.findMany({
      where: {
        organizationId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        impact: true,
        confidence: true,
        releaseId: true,
        createdAt: true,
      },
    });

    return {
      ok: true,
      recommendations: recommendations.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },
});

export const aidosListApprovalsTool = createTool({
  id: "aidos_list_approvals",
  description: "List governance approvals for the organization.",
  inputSchema: z.object({
    status: z
      .enum(["PENDING", "APPROVED", "REJECTED", "MODIFIED"])
      .optional()
      .describe("Filter by approval status"),
    limit: z
      .number()
      .optional()
      .describe("Max approvals to return (default 50, max 200)"),
  }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const limit = Math.min(input.limit ?? 50, 200);
    const status = input.status;

    const approvals = await prisma.approval.findMany({
      where: {
        organizationId,
        ...(status === "PENDING"
          ? { decision: null }
          : status
            ? { decision: status }
            : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        decision: true,
        recommendationId: true,
        createdAt: true,
        decidedAt: true,
        recommendation: {
          select: {
            description: true,
            requiredRole: true,
            releaseId: true,
            title: true,
          },
        },
      },
    });

    return {
      ok: true,
      approvals: approvals.map((a) => ({
        id: a.id,
        title: a.title ?? a.recommendation?.title ?? null,
        description: a.recommendation?.description ?? null,
        status: a.decision ?? "PENDING",
        requiredRole: a.recommendation?.requiredRole ?? null,
        recommendationId: a.recommendationId,
        releaseId: a.recommendation?.releaseId ?? null,
        createdAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
      })),
    };
  },
});

export const aidosListReleasesTool = createTool({
  id: "aidos_list_releases",
  description: "List releases for the organization.",
  inputSchema: z.object({
    status: z
      .enum([
        "DETECTED",
        "ASSESSED",
        "PENDING_APPROVAL",
        "APPROVED",
        "DEPLOYED",
        "BLOCKED",
      ])
      .optional()
      .describe("Filter by release status"),
    limit: z
      .number()
      .optional()
      .describe("Max releases to return (default 50, max 200)"),
  }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const limit = Math.min(input.limit ?? 50, 200);
    const releases = await prisma.release.findMany({
      where: {
        organizationId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        version: true,
        branch: true,
        environment: true,
        status: true,
        readinessScore: true,
        governanceRiskScore: true,
        riskLevel: true,
        primaryRecommendation: true,
        assessedAt: true,
        deployedAt: true,
        createdAt: true,
      },
    });

    return {
      ok: true,
      releases: releases.map((r) => ({
        ...r,
        assessedAt: r.assessedAt?.toISOString() ?? null,
        deployedAt: r.deployedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },
});

export const aidosGetReleaseReadinessTool = createTool({
  id: "aidos_get_release_readiness",
  description:
    "Get detailed readiness context for a release (DNA, Jira, GitHub, code analysis, policy).",
  inputSchema: z.object({
    releaseId: z.string().describe("Release id"),
  }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const ctx = await buildReleaseAssessContext(organizationId, input.releaseId);

    if (!ctx) {
      return { ok: false, error: "Release not found" };
    }

    if ("error" in ctx && ctx.error) {
      return {
        ok: true,
        release: {
          id: ctx.release.id,
          name: ctx.release.name,
          version: ctx.release.version,
          status: ctx.release.status,
          readinessScore: ctx.release.readinessScore,
          governanceRiskScore: ctx.release.governanceRiskScore,
          riskLevel: ctx.release.riskLevel,
          primaryRecommendation: ctx.release.primaryRecommendation,
          assessmentSummary: ctx.release.assessmentSummary,
        },
        error: ctx.error,
      };
    }

    const full = ctx as Exclude<typeof ctx, { error: string }>;
    const dna = full.dna
      ? {
          methodology: full.dna.workflowMode,
          approvalLevel: full.dna.approvalLevel,
          riskThreshold: full.dna.riskThreshold,
          autonomyMode: full.dna.autonomyMode,
          autonomyLevel: full.dna.autonomyLevel,
          governanceScore: full.dna.governanceScore,
          observabilityStrategy: full.dna.observabilityStrategy,
          summary: full.dna.summary,
        }
      : null;
    const health = full.jira?.health ?? null;

    return {
      ok: true,
      release: {
        id: full.release.id,
        name: full.release.name,
        version: full.release.version,
        branch: full.release.branch,
        environment: full.release.environment,
        status: full.release.status,
        readinessScore: full.release.readinessScore,
        governanceRiskScore: full.release.governanceRiskScore,
        riskLevel: full.release.riskLevel,
        primaryRecommendation: full.release.primaryRecommendation,
        assessmentSummary: full.release.assessmentSummary,
        assessedAt: full.release.assessedAt?.toISOString() ?? null,
      },
      dna,
      jira: full.jira
        ? {
            connected: full.jira.connected,
            synced: full.jira.synced,
            health: health
              ? {
                  score: health.score,
                  matchedVersion: health.matchedVersion ?? null,
                  scopeLabel: health.scopeLabel ?? null,
                  snapshotSyncedAt: health.snapshotSyncedAt,
                  topSignals: health.signals.slice(0, 8),
                  topGaps: health.gaps.slice(0, 8),
                  releaseScope: health.releaseScope ?? null,
                }
              : null,
          }
        : null,
      github: full.github
        ? {
            connected: full.github.connected,
            synced: full.github.synced,
            ci: full.github.ci,
            changeRisk: full.github.changeRisk,
          }
        : null,
      codeAnalysis: full.codeAnalysis
        ? {
            connected: full.codeAnalysis.connected,
            synced: full.codeAnalysis.synced,
            aiLinesPct: full.codeAnalysis.aiLinesPct,
            aiPrsPct: full.codeAnalysis.aiPrsPct,
            reviewCoverageOnAiPrsPct: full.codeAnalysis.reviewCoverageOnAiPrsPct,
            topSignals: (full.codeAnalysis.governanceSignals ?? []).slice(0, 8),
          }
        : null,
      jiraHygiene: full.jiraHygiene,
      governancePolicy: full.governancePolicy
        ? {
            deploymentThresholds: full.governancePolicy.deploymentThresholds ?? null,
            releaseRules: full.governancePolicy.releaseRules ?? null,
            approvalRequirements: full.governancePolicy.approvalRequirements ?? null,
          }
        : null,
    };
  },
});

export const aidosGetJiraContextTool = createTool({
  id: "aidos_get_jira_context",
  description:
    "Get Jira delivery context: connected projects, KPIs, sprint signals, and hygiene summary.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const stored = await resolveStoredJiraDelivery(organizationId);
    if (!stored) {
      return { ok: true, connected: false };
    }

    const projects = stored.snapshot.projects.map((p) => ({
      key: p.key,
      name: p.name,
      openIssues: p.openIssues,
      blockedCount: p.blockedCount,
      overdueCount: p.overdueCount,
      bugsOpen: p.bugsOpen,
      unassignedCount: p.unassignedCount,
      reopenedCount: p.reopenedCount ?? null,
      spilloverCount: p.spilloverCount ?? null,
      resolvedLast7d: p.resolvedLast7d ?? null,
      activeSprint: p.activeSprint
        ? {
            id: p.activeSprint.id,
            name: p.activeSprint.name,
            state: p.activeSprint.state,
            openIssues: p.activeSprint.openIssues ?? null,
            bugsOpen: p.activeSprint.bugsOpen ?? null,
            blockedCount: p.activeSprint.blockedCount ?? null,
            done: p.activeSprint.done ?? null,
            committed: p.activeSprint.committed ?? null,
          }
        : null,
    }));

    const hygiene = summarizePortfolioHygiene(stored.jiraHygiene);

    return {
      ok: true,
      connected: true,
      siteUrl: stored.siteUrl ?? null,
      projectKeys: stored.projectKeys,
      syncedAt: stored.snapshot.syncedAt,
      kpis: {
        projectCount: projects.length,
        openIssues: projects.reduce((s, p) => s + p.openIssues, 0),
        blockedCount: projects.reduce((s, p) => s + p.blockedCount, 0),
        overdueCount: projects.reduce((s, p) => s + p.overdueCount, 0),
        bugsOpen: projects.reduce((s, p) => s + p.bugsOpen, 0),
        unassignedCount: projects.reduce((s, p) => s + p.unassignedCount, 0),
      },
      projects,
      hygiene,
      calibration: stored.calibrationGate
        ? {
            status: stored.calibrationGate.status,
            calibrated: stored.calibrationGate.calibrated,
            pendingProjects: stored.calibrationGate.pendingProjects,
            message: stored.calibrationGate.message ?? null,
          }
        : null,
    };
  },
});

export const aidosGetCodeAnalysisTool = createTool({
  id: "aidos_get_code_analysis",
  description:
    "Get code analysis snapshot: AI attribution signals, recent PRs, and governance flags.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const stored = await resolveStoredCodeAnalysis(organizationId);
    if (!stored) {
      return {
        ok: true,
        connected: false,
        syncedAt: null,
        repoCount: 0,
        prCount: 0,
        commitCount: 0,
      };
    }

    const signals = new Map<string, number>();
    for (const pr of stored.pullRequests) {
      for (const flag of pr.qualityFlags ?? []) {
        signals.set(flag, (signals.get(flag) ?? 0) + 1);
      }
    }
    for (const commit of stored.commits) {
      for (const signal of commit.signals ?? []) {
        signals.set(signal, (signals.get(signal) ?? 0) + 1);
      }
    }

    const topSignals = [...signals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([signal, count]) => ({ signal, count }));

    const recentPrs = [...stored.pullRequests]
      .sort((a, b) => (b.mergedAt ?? "").localeCompare(a.mergedAt ?? ""))
      .slice(0, 15)
      .map((pr) => ({
        title: pr.title,
        state: "merged",
        author: pr.author,
        url: pr.url,
        repo: pr.repo,
        mergedAt: pr.mergedAt ?? null,
        attribution: pr.attribution,
      }));

    return {
      ok: true,
      connected: true,
      syncedAt: stored.syncedAt,
      repoCount: stored.repos.length,
      repos: stored.repos.slice(0, 40),
      prCount: stored.pullRequests.length,
      commitCount: stored.commits.length,
      topSignals,
      recentPrs,
    };
  },
});

export const aidosGetIntegrationHealthTool = createTool({
  id: "aidos_get_integration_health",
  description: "Check health of connected integrations (Jira, GitHub, etc.).",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const integrations = await prisma.integration.findMany({
      where: { organizationId },
      orderBy: { provider: "asc" },
    });

    const summaries = await Promise.all(
      integrations.map((integration) => checkIntegrationHealth(integration)),
    );
    const aggregate = summarizeIntegrationHealth(summaries);

    return {
      ok: true,
      integrations: summaries.map((s) => ({
        provider: s.provider,
        status: s.status,
        healthy: s.healthy,
        lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
        lastHealthCheckAt: s.lastHealthCheckAt?.toISOString() ?? null,
        lastError: s.lastError,
        webhookEnabled: s.webhookEnabled,
        message: s.message,
      })),
      aggregate,
    };
  },
});

export const aidosListIncidentsTool = createTool({
  id: "aidos_list_incidents",
  description: "List incidents for the organization.",
  inputSchema: z.object({
    status: z
      .enum(["OPEN", "INVESTIGATING", "REMEDIATED", "CLOSED"])
      .optional()
      .describe("Filter by incident status"),
    limit: z
      .number()
      .optional()
      .describe("Max incidents to return (default 50, max 200)"),
  }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const limit = Math.min(input.limit ?? 50, 200);
    const incidents = await prisma.incident.findMany({
      where: {
        organizationId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { detectedAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        severityScore: true,
        source: true,
        releaseId: true,
        detectedAt: true,
        resolvedAt: true,
        createdAt: true,
        release: {
          select: {
            id: true,
            name: true,
            version: true,
            status: true,
          },
        },
      },
    });

    return {
      ok: true,
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        status: i.status,
        severityScore: i.severityScore,
        source: i.source,
        releaseId: i.releaseId,
        detectedAt: i.detectedAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        release: i.release,
      })),
    };
  },
});

export const aidosListComplianceFindingsTool = createTool({
  id: "aidos_list_compliance_findings",
  description:
    "List compliance monitoring findings for the organization. Use to review open policy violations on PRs, commits, and AI code governance.",
  inputSchema: z.object({
    status: z
      .enum(["open", "resolved"])
      .optional()
      .describe("Filter by finding status (default: all statuses)"),
    severity: z
      .enum(["critical", "warning", "info"])
      .optional()
      .describe("Filter by severity"),
    projectKey: z.string().optional().describe("Filter by Jira project key"),
    limit: z
      .number()
      .optional()
      .describe("Max findings to return (default 100, max 200)"),
  }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const [findings, summary] = await Promise.all([
      loadComplianceFindings(organizationId, {
        status: input.status,
        severity: input.severity,
        projectKey: input.projectKey,
        limit: input.limit,
      }),
      loadComplianceFindingSummary(organizationId),
    ]);

    return { ok: true, findings, summary };
  },
});

export const aidosListPredictionsTool = createTool({
  id: "aidos_list_predictions",
  description:
    "List forward-looking problem predictions for the organization. Use to review early-warning signals.",
  inputSchema: z.object({
    status: z
      .enum(["open", "resolved"])
      .optional()
      .describe("Filter by prediction status (default: all statuses)"),
    severity: z
      .enum(["critical", "warning", "info"])
      .optional()
      .describe("Filter by severity"),
    domain: z
      .enum(["delivery", "devops", "compliance", "planning", "code"])
      .optional()
      .describe("Filter by prediction domain"),
    projectKey: z.string().optional().describe("Filter by Jira project key"),
    limit: z
      .number()
      .optional()
      .describe("Max predictions to return (default 100, max 200)"),
  }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const [predictions, summary] = await Promise.all([
      loadProblemPredictions(organizationId, {
        status: input.status,
        severity: input.severity,
        domain: input.domain,
        projectKey: input.projectKey,
        limit: input.limit,
      }),
      loadPredictionSummary(organizationId),
    ]);

    return { ok: true, predictions, summary };
  },
});

export const aidosQueryJiraJqlTool = createTool({
  id: "aidos_query_jira_jql",
  description:
    "Run a read-only JQL query against the organization's connected Jira projects. Prefer presets when possible.",
  inputSchema: z
    .object({
      jql: z.string().trim().min(1).max(2000).optional(),
      preset: z.enum(JIRA_JQL_PRESETS).optional(),
      mode: z.enum(["count", "issues"]).optional(),
      maxResults: z.number().int().min(1).max(50).optional(),
    })
    .refine((value) => Boolean(value.jql || value.preset), {
      message: "Provide jql or preset",
    }),
  execute: async (input, context) => {
    const { organizationId } = getAidosToolContext(context);
    const result = await queryJiraJqlForOrganization({
      organizationId,
      jql: input.jql,
      preset: input.preset,
      mode: input.mode,
      maxResults: input.maxResults,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      jql: result.jql,
      mode: result.mode,
      projectKeys: result.projectKeys,
      count: result.count,
      issues: result.issues,
      nextPageToken: result.nextPageToken,
      queriedAt: result.queriedAt,
      preset: result.preset,
    };
  },
});

export const aidosTools = {
  aidos_get_org_context: aidosGetOrgContextTool,
  aidos_list_recommendations: aidosListRecommendationsTool,
  aidos_list_approvals: aidosListApprovalsTool,
  aidos_list_releases: aidosListReleasesTool,
  aidos_get_release_readiness: aidosGetReleaseReadinessTool,
  aidos_get_jira_context: aidosGetJiraContextTool,
  aidos_get_code_analysis: aidosGetCodeAnalysisTool,
  aidos_get_integration_health: aidosGetIntegrationHealthTool,
  aidos_list_incidents: aidosListIncidentsTool,
  aidos_list_compliance_findings: aidosListComplianceFindingsTool,
  aidos_list_predictions: aidosListPredictionsTool,
  aidos_query_jira_jql: aidosQueryJiraJqlTool,
} as const;

export type AidosToolMap = typeof aidosTools;

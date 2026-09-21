import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  selectAiRiskPct,
  selectDeliveryAnalysisSnapshot,
  selectOverviewModel,
} from "@/lib/store/selectors";

import {
  getDrydockAssistantToolContext,
  loadDrydockAssistantState,
} from "./context";

function previewJson(value: unknown, max = 12_000): unknown {
  try {
    const text = JSON.stringify(value);
    if (text.length <= max) return value;
    return {
      truncated: true,
      preview: `${text.slice(0, max)}…`,
    };
  } catch {
    return { error: "Unable to serialize store payload" };
  }
}

export const listScopeTool = createTool({
  id: "list_scope",
  description:
    "List the org, available teams, and sprints in DryDock so you can interpret filters and name evidence correctly.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    return {
      ok: true as const,
      org: state.data.org,
      activeFilters: {
        team: state.filters.team,
        sprint: state.filters.sprint ?? state.data.dimensions.defaultSprintId,
      },
      teams: state.data.dimensions.teams,
      sprints: state.data.dimensions.sprints.map((s) => ({
        id: s.id,
        name: s.name,
        startLabel: s.startLabel,
        endLabel: s.endLabel,
      })),
      lastSyncAt: state.data.meta.lastSyncAt,
    };
  },
});

export const getOverviewTool = createTool({
  id: "get_overview",
  description:
    "Get the Overview dashboard for the active team/sprint: delivery confidence, takeaways, pillars, attention, and leadership items.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    const overview = selectOverviewModel(state);
    return {
      ok: true as const,
      overview: previewJson(overview),
      aiCodeRiskPct: selectAiRiskPct(state),
    };
  },
});

export const getAttentionTool = createTool({
  id: "get_attention",
  description:
    "List items needing attention from the attention queue (with reason and originating decision).",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    return {
      ok: true as const,
      items: state.data.attention.items,
    };
  },
});

export const getDeliveryTool = createTool({
  id: "get_delivery",
  description:
    "Get the delivery-analysis snapshot for the active team/sprint (completion, blocked/at-risk counts, trends).",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    const snapshot = selectDeliveryAnalysisSnapshot(state);
    return {
      ok: true as const,
      delivery: previewJson(snapshot),
    };
  },
});

export const getQaTool = createTool({
  id: "get_qa",
  description:
    "Get QA suite health and page view summary from DryDock.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    return {
      ok: true as const,
      empty: state.data.qa.empty,
      suiteHealth: previewJson(state.data.qa.suiteHealth),
      view: previewJson(state.data.qa.view),
    };
  },
});

export const getCodeTool = createTool({
  id: "get_code",
  description:
    "Get code-analysis snapshot and AI risk percentages from DryDock.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    const { codeAnalysis } = state.data;
    return {
      ok: true as const,
      aiRiskPctByTeam: codeAnalysis.aiRiskPctByTeam,
      defaultAiRiskPct: codeAnalysis.defaultAiRiskPct,
      activeAiRiskPct: selectAiRiskPct(state),
      availableRepos: codeAnalysis.availableRepos,
      snapshot: previewJson(codeAnalysis.snapshot),
    };
  },
});

export const getReleasesTool = createTool({
  id: "get_releases",
  description: "List releases and optional detail payloads from DryDock.",
  inputSchema: z.object({
    releaseId: z
      .string()
      .optional()
      .describe("When set, return that release detail if present"),
  }),
  execute: async (input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    const { releases } = state.data;
    if (input.releaseId) {
      return {
        ok: true as const,
        release: previewJson(releases.byId[input.releaseId] ?? null),
        items: releases.items.filter((r) => r.id === input.releaseId),
      };
    }
    return {
      ok: true as const,
      items: releases.items,
    };
  },
});

export const getRiskTool = createTool({
  id: "get_risk",
  description: "Get risk items and narrative from DryDock.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    return {
      ok: true as const,
      risk: state.data.risk,
    };
  },
});

export const getIntegrationsTool = createTool({
  id: "get_integrations",
  description: "List connected integrations and sync status from DryDock.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    return {
      ok: true as const,
      integrations: state.data.integrations.items,
    };
  },
});

export const getBriefingTool = createTool({
  id: "get_briefing",
  description: "Get the executive briefing payload from DryDock.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getDrydockAssistantToolContext(context);
    const state = loadDrydockAssistantState(ctx);
    return {
      ok: true as const,
      briefing: previewJson(state.data.briefing),
    };
  },
});

export const drydockAssistantTools = {
  list_scope: listScopeTool,
  get_overview: getOverviewTool,
  get_attention: getAttentionTool,
  get_delivery: getDeliveryTool,
  get_qa: getQaTool,
  get_code: getCodeTool,
  get_releases: getReleasesTool,
  get_risk: getRiskTool,
  get_integrations: getIntegrationsTool,
  get_briefing: getBriefingTool,
} as const;

export type DrydockAssistantToolId = keyof typeof drydockAssistantTools;

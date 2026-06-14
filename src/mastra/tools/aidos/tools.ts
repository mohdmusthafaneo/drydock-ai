import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { agentJson } from "./client";
import { getAidosToolContext } from "./context";
import {
  APPROVAL_ROLE_VALUES,
  IMPACT_VALUES,
  SPECIALIST_ROLE_VALUES,
} from "./names";

const inboxQueryFromWake = (wakePayload: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const key of [
    "approvalId",
    "decision",
    "releaseId",
    "webhookEventId",
    "telemetryEventId",
    "event",
  ] as const) {
    const value = wakePayload[key];
    if (typeof value === "string") {
      params.set(key, value);
    }
  }
  return params;
};

export const aidosGetMeTool = createTool({
  id: "aidos_get_me",
  description: "Get current agent identity, permissions, and runtime config.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(ctx, "/api/agents/me");
  },
});

export const aidosGetInboxTool = createTool({
  id: "aidos_get_inbox",
  description: "List prioritized pending work items for this agent.",
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe("Max items to return (default 20, max 50)"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    const limit = Math.min(input.limit ?? 20, 50);
    const params = inboxQueryFromWake(ctx.wakePayload);
    params.set("limit", String(limit));
    return agentJson(ctx, `/api/agents/me/inbox?${params}`);
  },
});

export const aidosAssessReleaseTool = createTool({
  id: "aidos_assess_release",
  description:
    "Run governance assessment on a release and create recommendation + approval.",
  inputSchema: z.object({
    releaseId: z.string().describe("Release id to assess"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/releases/${encodeURIComponent(input.releaseId)}/assess`,
      { method: "POST", body: "{}" },
    );
  },
});

export const aidosCreateRecommendationTool = createTool({
  id: "aidos_create_recommendation",
  description: "Create a governance recommendation (and approval when required).",
  inputSchema: z.object({
    title: z.string(),
    description: z.string(),
    rationale: z.string(),
    confidence: z.number().describe("0.0 to 1.0"),
    impact: z.enum(IMPACT_VALUES).optional(),
    releaseId: z.string().optional(),
    requiredRole: z.enum(APPROVAL_ROLE_VALUES).optional(),
    createApproval: z.boolean().optional(),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(ctx, "/api/agents/me/recommendations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
});

export const aidosCompleteWorkItemTool = createTool({
  id: "aidos_complete_work_item",
  description: "Acknowledge an inbox work item as complete.",
  inputSchema: z.object({
    workItemId: z
      .string()
      .describe("Inbox item id, e.g. release_assess:<releaseId>"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/work-items/${encodeURIComponent(input.workItemId)}/complete`,
      { method: "POST", body: "{}" },
    );
  },
});

export const aidosHireAgentTool = createTool({
  id: "aidos_hire_agent",
  description:
    "Request hiring a specialist agent with custom AGENTS.md (requires human AGENT_HIRE approval).",
  inputSchema: z.object({
    displayName: z.string(),
    role: z.enum(SPECIALIST_ROLE_VALUES),
    capabilities: z.string().optional(),
    reportsToAgentId: z.string().optional(),
    instructionsBundle: z.object({
      files: z
        .record(z.string(), z.unknown())
        .describe("Must include AGENTS.md with role charter"),
    }),
    desiredSkills: z.array(z.string()).optional(),
    runtimeConfig: z.record(z.string(), z.unknown()).optional(),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(ctx, "/api/agents/hire", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
});

export const aidosCompleteInitializationTool = createTool({
  id: "aidos_complete_initialization",
  description:
    "Mark Super Agent team initialization complete after INITIALIZE.md hires are submitted.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(ctx, "/api/agents/me/initialization/complete", {
      method: "POST",
      body: "{}",
    });
  },
});

export const aidosDelegateWakeupTool = createTool({
  id: "aidos_delegate_wakeup",
  description:
    "Delegate work to a specialist agent by enqueueing a delegation wakeup (Super Agent only). May be called multiple times in one heartbeat for parallel specialists (e.g. QA + DevOps) — each target gets its own wakeup on the same thread.",
  inputSchema: z.object({
    targetAgentId: z
      .string()
      .optional()
      .describe("Specialist agent id (use targetRole if unknown)"),
    targetRole: z
      .enum(SPECIALIST_ROLE_VALUES)
      .optional()
      .describe("Resolve specialist by role when targetAgentId is omitted"),
    reason: z
      .string()
      .describe("Delegation reason, e.g. release.detected or chat.delegate"),
    payload: z
      .object({
        threadId: z.string().optional().describe("Agent chat thread id"),
        triggerMessageId: z
          .string()
          .optional()
          .describe("Human message id that triggered the chat wakeup"),
      })
      .passthrough()
      .optional()
      .describe(
        "Work context passed to specialist wakeup. For agent chat threads include threadId and triggerMessageId.",
      ),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(ctx, "/api/agents/me/delegate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
});

export const aidosInviteAgentToThreadTool = createTool({
  id: "aidos_invite_agent_to_thread",
  description:
    "Invite a specialist agent to an operational chat thread and post a system routing message (Super Agent only).",
  inputSchema: z.object({
    threadId: z.string().describe("Agent chat thread id"),
    targetAgentId: z.string().describe("Specialist agent id to invite"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/chat/threads/${encodeURIComponent(input.threadId)}/invite`,
      {
        method: "POST",
        body: JSON.stringify({ targetAgentId: input.targetAgentId }),
      },
    );
  },
});

export const aidosPostThreadMessageTool = createTool({
  id: "aidos_post_thread_message",
  description:
    "Post a visible agent reply to an operational chat thread (coordinator or invited specialist).",
  inputSchema: z.object({
    threadId: z.string().describe("Agent chat thread id"),
    contentMarkdown: z
      .string()
      .describe("Reply content shown to humans in the thread timeline"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/chat/threads/${encodeURIComponent(input.threadId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ contentMarkdown: input.contentMarkdown }),
      },
    );
  },
});

export const aidosCloseThreadTool = createTool({
  id: "aidos_close_thread",
  description:
    "Close an operational chat thread with a summary (Super Agent only). Sets status to done and persists summaryMarkdown as thread contextSummary for future wakeups after reopen.",
  inputSchema: z.object({
    threadId: z.string().describe("Agent chat thread id"),
    summaryMarkdown: z
      .string()
      .describe(
        "Closure summary shown in the timeline and stored as contextSummary for LLM context on reopen",
      ),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/chat/threads/${encodeURIComponent(input.threadId)}/close`,
      {
        method: "POST",
        body: JSON.stringify({ summaryMarkdown: input.summaryMarkdown }),
      },
    );
  },
});

export const aidosReopenThreadTool = createTool({
  id: "aidos_reopen_thread",
  description:
    "Reopen a closed operational chat thread (Super Agent only). Sets status to active.",
  inputSchema: z.object({
    threadId: z.string().describe("Agent chat thread id"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/chat/threads/${encodeURIComponent(input.threadId)}/reopen`,
      { method: "POST", body: "{}" },
    );
  },
});

export const aidosAwaitHumanInputTool = createTool({
  id: "aidos_await_human_input",
  description:
    "Mark thread as awaiting human input and post a system prompt (coordinator or invited specialist).",
  inputSchema: z.object({
    threadId: z.string().describe("Agent chat thread id"),
    promptMarkdown: z
      .string()
      .optional()
      .describe("Optional prompt explaining what input is needed"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/chat/threads/${encodeURIComponent(input.threadId)}/await-human`,
      {
        method: "POST",
        body: JSON.stringify({ promptMarkdown: input.promptMarkdown }),
      },
    );
  },
});

export const aidosRequestApprovalTool = createTool({
  id: "aidos_request_approval",
  description:
    "Request human approval for a critical action in an operational chat thread. Posts an approval card and sets thread to awaiting_human.",
  inputSchema: z.object({
    threadId: z.string().describe("Agent chat thread id"),
    title: z.string().describe("Short approval title"),
    description: z
      .string()
      .describe("What action requires approval and why"),
    rationale: z.string().optional().describe("Optional governance rationale"),
    action: z
      .string()
      .describe("Action key, e.g. assess_release, integration_mutation"),
    requiredRole: z.enum(APPROVAL_ROLE_VALUES).optional(),
    riskScore: z.number().optional().describe("0.0 to 1.0"),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional extra context (releaseId, etc.)"),
  }),
  execute: async (input, context) => {
    const ctx = getAidosToolContext(context);
    return agentJson(
      ctx,
      `/api/agents/me/chat/threads/${encodeURIComponent(input.threadId)}/approvals`,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          rationale: input.rationale,
          action: input.action,
          requiredRole: input.requiredRole,
          riskScore: input.riskScore,
          payload: input.payload,
        }),
      },
    );
  },
});

export const aidosTools = {
  aidos_get_me: aidosGetMeTool,
  aidos_get_inbox: aidosGetInboxTool,
  aidos_assess_release: aidosAssessReleaseTool,
  aidos_create_recommendation: aidosCreateRecommendationTool,
  aidos_complete_work_item: aidosCompleteWorkItemTool,
  aidos_hire_agent: aidosHireAgentTool,
  aidos_complete_initialization: aidosCompleteInitializationTool,
  aidos_delegate_wakeup: aidosDelegateWakeupTool,
  aidos_invite_agent_to_thread: aidosInviteAgentToThreadTool,
  aidos_post_thread_message: aidosPostThreadMessageTool,
  aidos_close_thread: aidosCloseThreadTool,
  aidos_reopen_thread: aidosReopenThreadTool,
  aidos_await_human_input: aidosAwaitHumanInputTool,
  aidos_request_approval: aidosRequestApprovalTool,
} as const;

export type AidosToolMap = typeof aidosTools;

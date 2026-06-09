import type { AgentType } from "@/generated/prisma/client";
import type { LlmToolDefinition } from "../llm/types";
import { getAllowedTools, type AgentToolName } from "../tools/registry";

export type AidosToolContext = {
  apiBaseUrl: string;
  agentApiKey: string;
  runId: string;
  wakePayload: Record<string, unknown>;
};

const TOOL_DEFINITIONS: Record<string, LlmToolDefinition> = {
  aidos_get_me: {
    name: "aidos_get_me",
    description: "Get current agent identity, permissions, and runtime config.",
    input_schema: { type: "object", properties: {} },
  },
  aidos_get_inbox: {
    name: "aidos_get_inbox",
    description: "List prioritized pending work items for this agent.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max items to return (default 20, max 50)",
        },
      },
    },
  },
  aidos_assess_release: {
    name: "aidos_assess_release",
    description:
      "Run governance assessment on a release and create recommendation + approval.",
    input_schema: {
      type: "object",
      properties: {
        releaseId: { type: "string", description: "Release id to assess" },
      },
      required: ["releaseId"],
    },
  },
  aidos_create_recommendation: {
    name: "aidos_create_recommendation",
    description: "Create a governance recommendation (and approval when required).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        rationale: { type: "string" },
        confidence: { type: "number", description: "0.0 to 1.0" },
        impact: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        },
        releaseId: { type: "string" },
        requiredRole: {
          type: "string",
          enum: ["QA_LEAD", "DEVOPS_LEAD", "ENGINEERING_MANAGER", "ORG_ADMIN"],
        },
        createApproval: { type: "boolean" },
      },
      required: ["title", "description", "rationale", "confidence"],
    },
  },
  aidos_complete_work_item: {
    name: "aidos_complete_work_item",
    description: "Acknowledge an inbox work item as complete.",
    input_schema: {
      type: "object",
      properties: {
        workItemId: {
          type: "string",
          description: "Inbox item id, e.g. release_assess:<releaseId>",
        },
      },
      required: ["workItemId"],
    },
  },
};

const TOOL_TO_REGISTRY: Record<string, AgentToolName | null> = {
  aidos_get_me: null,
  aidos_get_inbox: null,
  aidos_assess_release: "assess_release",
  aidos_create_recommendation: "create_recommendation",
  aidos_complete_work_item: null,
};

export function buildAidosLlmTools(agentType: AgentType): LlmToolDefinition[] {
  const allowed = new Set(getAllowedTools(agentType));
  const tools: LlmToolDefinition[] = [];

  for (const [toolName, registryName] of Object.entries(TOOL_TO_REGISTRY)) {
    if (registryName === null || allowed.has(registryName)) {
      const def = TOOL_DEFINITIONS[toolName];
      if (def) tools.push(def);
    }
  }

  return tools;
}

async function agentFetch(
  ctx: AidosToolContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${ctx.agentApiKey}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-Run-Id", ctx.runId);

  return fetch(`${ctx.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
}

export async function executeAidosTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AidosToolContext,
): Promise<string> {
  try {
    switch (name) {
      case "aidos_get_me": {
        const res = await agentFetch(ctx, "/api/agents/me");
        return JSON.stringify(await res.json());
      }

      case "aidos_get_inbox": {
        const limit =
          typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
        const params = new URLSearchParams({ limit: String(limit) });
        if (typeof ctx.wakePayload.approvalId === "string") {
          params.set("approvalId", ctx.wakePayload.approvalId);
        }
        const res = await agentFetch(ctx, `/api/agents/me/inbox?${params}`);
        return JSON.stringify(await res.json());
      }

      case "aidos_assess_release": {
        const releaseId = args.releaseId;
        if (typeof releaseId !== "string" || !releaseId) {
          return JSON.stringify({ error: "releaseId is required" });
        }
        const res = await agentFetch(
          ctx,
          `/api/agents/me/releases/${encodeURIComponent(releaseId)}/assess`,
          { method: "POST", body: "{}" },
        );
        return JSON.stringify(await res.json());
      }

      case "aidos_create_recommendation": {
        const res = await agentFetch(ctx, "/api/agents/me/recommendations", {
          method: "POST",
          body: JSON.stringify(args),
        });
        return JSON.stringify(await res.json());
      }

      case "aidos_complete_work_item": {
        const workItemId = args.workItemId;
        if (typeof workItemId !== "string" || !workItemId) {
          return JSON.stringify({ error: "workItemId is required" });
        }
        const res = await agentFetch(
          ctx,
          `/api/agents/me/work-items/${encodeURIComponent(workItemId)}/complete`,
          { method: "POST", body: "{}" },
        );
        return JSON.stringify(await res.json());
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Tool execution failed",
    });
  }
}

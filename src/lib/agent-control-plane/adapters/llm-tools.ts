import type { AgentType } from "@/generated/prisma/client";
import type { LlmToolDefinition } from "../llm/types";
import { getAllowedTools, type AgentToolName } from "../tools/registry";
import type { AgentPermissions } from "../types";

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
  aidos_hire_agent: {
    name: "aidos_hire_agent",
    description:
      "Request hiring a specialist agent with custom AGENTS.md (requires human AGENT_HIRE approval).",
    input_schema: {
      type: "object",
      properties: {
        displayName: { type: "string" },
        role: {
          type: "string",
          enum: [
            "qa_intelligence",
            "devops_intelligence",
            "governance",
            "incident_correlation",
            "integration",
          ],
        },
        capabilities: { type: "string" },
        reportsToAgentId: { type: "string" },
        instructionsBundle: {
          type: "object",
          properties: {
            files: {
              type: "object",
              description: "Must include AGENTS.md with role charter",
            },
          },
          required: ["files"],
        },
        desiredSkills: {
          type: "array",
          items: { type: "string" },
        },
        runtimeConfig: { type: "object" },
      },
      required: ["displayName", "role", "instructionsBundle"],
    },
  },
  aidos_complete_initialization: {
    name: "aidos_complete_initialization",
    description:
      "Mark Super Agent team initialization complete after INITIALIZE.md hires are submitted.",
    input_schema: { type: "object", properties: {} },
  },
  aidos_delegate_wakeup: {
    name: "aidos_delegate_wakeup",
    description:
      "Delegate work to a specialist agent by enqueueing a delegation wakeup (Super Agent only).",
    input_schema: {
      type: "object",
      properties: {
        targetAgentId: {
          type: "string",
          description: "Specialist agent id (use targetRole if unknown)",
        },
        targetRole: {
          type: "string",
          enum: [
            "qa_intelligence",
            "devops_intelligence",
            "governance",
            "incident_correlation",
            "integration",
          ],
          description: "Resolve specialist by role when targetAgentId is omitted",
        },
        reason: {
          type: "string",
          description: "Delegation reason, e.g. release.detected",
        },
        payload: {
          type: "object",
          description: "Work context passed to specialist wakeup (releaseId, etc.)",
        },
      },
      required: ["reason"],
    },
  },
};

const TOOL_TO_REGISTRY: Record<string, AgentToolName | null> = {
  aidos_get_me: null,
  aidos_get_inbox: null,
  aidos_assess_release: "assess_release",
  aidos_create_recommendation: "create_recommendation",
  aidos_complete_work_item: null,
  aidos_hire_agent: "hire_agent",
  aidos_complete_initialization: null,
  aidos_delegate_wakeup: null,
};

export function buildAidosLlmTools(
  agentType: AgentType,
  permissions?: AgentPermissions,
): LlmToolDefinition[] {
  const allowed = new Set(getAllowedTools(agentType));
  const tools: LlmToolDefinition[] = [];

  for (const [toolName, registryName] of Object.entries(TOOL_TO_REGISTRY)) {
    if (toolName === "aidos_hire_agent" && !permissions?.canCreateAgents) {
      continue;
    }
    if (toolName === "aidos_complete_initialization") {
      if (agentType !== "SUPER_ORCHESTRATOR") continue;
    }
    if (toolName === "aidos_delegate_wakeup") {
      if (agentType !== "SUPER_ORCHESTRATOR") continue;
    }
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

async function parseAgentResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const snippet = (await res.text()).slice(0, 120);
    return {
      error: `Expected JSON from agent API but got ${res.status} ${contentType || "unknown"}`,
      hint:
        res.status === 401 || snippet.includes("<!DOCTYPE")
          ? "Route may be blocked by session middleware — agent Bearer routes must bypass login redirect"
          : undefined,
      bodyPreview: snippet,
    };
  }
  return res.json();
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
        return JSON.stringify(await parseAgentResponse(res));
      }

      case "aidos_get_inbox": {
        const limit =
          typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
        const params = new URLSearchParams({ limit: String(limit) });
        if (typeof ctx.wakePayload.approvalId === "string") {
          params.set("approvalId", ctx.wakePayload.approvalId);
        }
        if (typeof ctx.wakePayload.decision === "string") {
          params.set("decision", ctx.wakePayload.decision);
        }
        if (typeof ctx.wakePayload.releaseId === "string") {
          params.set("releaseId", ctx.wakePayload.releaseId);
        }
        if (typeof ctx.wakePayload.webhookEventId === "string") {
          params.set("webhookEventId", ctx.wakePayload.webhookEventId);
        }
        if (typeof ctx.wakePayload.telemetryEventId === "string") {
          params.set("telemetryEventId", ctx.wakePayload.telemetryEventId);
        }
        if (typeof ctx.wakePayload.event === "string") {
          params.set("event", ctx.wakePayload.event);
        }
        const res = await agentFetch(ctx, `/api/agents/me/inbox?${params}`);
        return JSON.stringify(await parseAgentResponse(res));
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
        return JSON.stringify(await parseAgentResponse(res));
      }

      case "aidos_create_recommendation": {
        const res = await agentFetch(ctx, "/api/agents/me/recommendations", {
          method: "POST",
          body: JSON.stringify(args),
        });
        return JSON.stringify(await parseAgentResponse(res));
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
        return JSON.stringify(await parseAgentResponse(res));
      }

      case "aidos_hire_agent": {
        const res = await agentFetch(ctx, "/api/agents/hire", {
          method: "POST",
          body: JSON.stringify(args),
        });
        return JSON.stringify(await parseAgentResponse(res));
      }

      case "aidos_complete_initialization": {
        const res = await agentFetch(ctx, "/api/agents/me/initialization/complete", {
          method: "POST",
          body: "{}",
        });
        return JSON.stringify(await parseAgentResponse(res));
      }

      case "aidos_delegate_wakeup": {
        const res = await agentFetch(ctx, "/api/agents/me/delegate", {
          method: "POST",
          body: JSON.stringify(args),
        });
        return JSON.stringify(await parseAgentResponse(res));
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

import { z } from "zod";
import type { AgentType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildInstructionsAdapterConfig,
  writeInstructionsFiles,
} from "./instructions/service";
import { ensureAgentApiKey } from "./api-keys";
import { logAgentActivity, logAgentAudit } from "./audit";
import {
  defaultRuntimeConfigForAgentType,
  parseRuntimeConfig,
  serializeRuntimeConfig,
} from "./runtime-config";
import {
  mergeApprovalPayload,
  type ApprovalChatContext,
} from "@/lib/approvals/chat-context";
import { enqueueWakeup } from "./wakeup";
import { resolveHireAgentsMd, buildHiredAgentInstructionFiles } from "./hire-templates";

export const HIRE_ROLES = [
  "qa_intelligence",
  "devops_intelligence",
  "governance",
  "incident_correlation",
  "integration",
] as const;

export type HireRole = (typeof HIRE_ROLES)[number];

const ROLE_TO_AGENT_TYPE: Record<HireRole, AgentType> = {
  qa_intelligence: "QA_INTELLIGENCE",
  devops_intelligence: "DEVOPS_INTELLIGENCE",
  governance: "GOVERNANCE",
  incident_correlation: "INCIDENT_CORRELATION",
  integration: "INTEGRATION",
};

export const hireRequestSchema = z.object({
  displayName: z.string().min(1).max(100),
  role: z.enum(HIRE_ROLES),
  reportsToAgentId: z.string().optional(),
  capabilities: z.string().optional(),
  instructionsBundle: z.object({
    files: z
      .record(z.string(), z.string())
      .refine((files) => Boolean(files["AGENTS.md"]?.trim()), {
        message: "instructionsBundle.files.AGENTS.md is required",
      }),
  }),
  desiredSkills: z.array(z.string()).optional(),
  adapterType: z.enum(["mastra", "http", "process"]).default("mastra"),
  runtimeConfig: z
    .object({
      heartbeat: z
        .object({
          enabled: z.boolean().optional(),
          intervalSec: z.number().optional(),
          wakeOnEvent: z.boolean().optional(),
          wakeOnApproval: z.boolean().optional(),
          wakeOnDelegation: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type AgentHirePayload = z.infer<typeof hireRequestSchema> & {
  agentId: string;
};

export function roleToAgentType(role: HireRole): AgentType {
  return ROLE_TO_AGENT_TYPE[role];
}

const DEFAULT_DOMAIN_SKILLS: Partial<Record<HireRole, string[]>> = {
  qa_intelligence: ["aidos", "aidos-release-assess"],
  devops_intelligence: ["aidos", "aidos-telemetry"],
  governance: ["aidos", "aidos-release-assess"],
};

export function defaultDesiredSkillsForRole(role: HireRole): string[] {
  return DEFAULT_DOMAIN_SKILLS[role] ?? ["aidos"];
}

export function parseHirePayload(json: string): AgentHirePayload | null {
  try {
    return JSON.parse(json) as AgentHirePayload;
  } catch {
    return null;
  }
}

async function normalizeHireBody(body: z.infer<typeof hireRequestSchema>) {
  const submitted = body.instructionsBundle.files["AGENTS.md"] ?? "";
  const { content, enriched } = await resolveHireAgentsMd(
    body.role,
    submitted,
    body.displayName,
  );

  return {
    body: {
      ...body,
      desiredSkills: body.desiredSkills ?? defaultDesiredSkillsForRole(body.role),
      instructionsBundle: {
        files: {
          ...body.instructionsBundle.files,
          "AGENTS.md": content,
        },
      },
    },
    agentsMdEnriched: enriched,
  };
}

export async function createAgentHireRequest(input: {
  organizationId: string;
  requestingAgentId: string;
  body: z.infer<typeof hireRequestSchema>;
  chatContext?: ApprovalChatContext;
}) {
  const parsed = hireRequestSchema.parse(input.body);
  const { body, agentsMdEnriched } = await normalizeHireBody(parsed);
  const agentType = roleToAgentType(body.role);

  const reportsToAgentId = body.reportsToAgentId ?? input.requestingAgentId;

  const manager = await prisma.agentRegistry.findFirst({
    where: {
      id: reportsToAgentId,
      organizationId: input.organizationId,
      status: { not: "TERMINATED" },
    },
  });
  if (!manager) {
    return { ok: false as const, error: "reportsToAgentId not found" };
  }

  const pendingHire = await prisma.approval.findFirst({
    where: {
      organizationId: input.organizationId,
      type: "AGENT_HIRE",
      decision: null,
      payloadJson: { contains: `"role":"${body.role}"` },
    },
  });
  if (pendingHire) {
    const payload = parseHirePayload(pendingHire.payloadJson);
    return {
      ok: true as const,
      agentId: payload?.agentId,
      approvalId: pendingHire.id,
      coalesced: true,
    };
  }

  const runtimeConfig = body.runtimeConfig
    ? parseRuntimeConfig(JSON.stringify(body.runtimeConfig))
    : defaultRuntimeConfigForAgentType(agentType);

  const result = await prisma.$transaction(async (tx) => {
    const agent = await tx.agentRegistry.create({
      data: {
        organizationId: input.organizationId,
        agentType,
        role: body.role,
        displayName: body.displayName,
        description: body.capabilities ?? null,
        status: "PENDING_APPROVAL",
        autonomyMode: "RECOMMEND",
        reportsToAgentId,
        adapterType: body.adapterType,
        adapterConfigJson: "{}",
        runtimeConfigJson: serializeRuntimeConfig(runtimeConfig),
        permissionsJson: JSON.stringify({ canCreateAgents: false }),
        createdByAgentId: input.requestingAgentId,
      },
    });

    const hirePayload: AgentHirePayload = {
      ...body,
      agentId: agent.id,
    };

    const approval = await tx.approval.create({
      data: {
        organizationId: input.organizationId,
        type: "AGENT_HIRE",
        title: `Hire agent: ${body.displayName}`,
        payloadJson: input.chatContext
          ? mergeApprovalPayload(hirePayload, input.chatContext)
          : JSON.stringify(hirePayload),
        requestedByAgentId: input.requestingAgentId,
        riskScore: 0.5,
      },
    });

    await logAgentActivity(tx, {
      organizationId: input.organizationId,
      type: "agent.hire.requested",
      title: `Hire requested: ${body.displayName}`,
      description: body.capabilities ?? body.role,
      metadata: {
        agentId: agent.id,
        approvalId: approval.id,
        role: body.role,
        requestedByAgentId: input.requestingAgentId,
      },
    });

    await logAgentAudit(tx, {
      organizationId: input.organizationId,
      action: "agent.hire.requested",
      entityType: "AgentRegistry",
      entityId: agent.id,
      agentId: input.requestingAgentId,
      metadata: { approvalId: approval.id, role: body.role },
    });

    return { agentId: agent.id, approvalId: approval.id };
  });

  return { ok: true as const, ...result, coalesced: false, agentsMdEnriched };
}

export async function activateHiredAgent(
  tx: Prisma.TransactionClient,
  organizationId: string,
  approvalId: string,
  payload: AgentHirePayload,
) {
  const agentType = roleToAgentType(payload.role);
  const adapterConfig = buildInstructionsAdapterConfig(
    organizationId,
    payload.agentId,
    payload.desiredSkills,
  );

  const submitted = payload.instructionsBundle.files["AGENTS.md"] ?? "";
  const { content: agentsMd } = await resolveHireAgentsMd(
    payload.role,
    submitted,
    payload.displayName,
  );

  const instructionFiles = await buildHiredAgentInstructionFiles(payload.role, agentsMd);

  await writeInstructionsFiles(organizationId, payload.agentId, instructionFiles);

  await tx.agentRegistry.update({
    where: { id: payload.agentId },
    data: {
      status: "IDLE",
      adapterConfigJson: JSON.stringify(adapterConfig),
      lastActiveAt: new Date(),
    },
  });

  await ensureAgentApiKey(tx, organizationId, payload.agentId, "post-hire");

  await tx.activityEvent.create({
    data: {
      organizationId,
      type: "agent.hire.approved",
      title: `Agent hired: ${payload.displayName}`,
      description: payload.capabilities ?? payload.role,
      metadataJson: JSON.stringify({
        agentId: payload.agentId,
        approvalId,
        role: payload.role,
        agentType,
      }),
    },
  });

  await tx.auditLog.create({
    data: {
      organizationId,
      action: "agent.hire.approved",
      entityType: "AgentRegistry",
      entityId: payload.agentId,
      metadataJson: JSON.stringify({ approvalId, role: payload.role }),
    },
  });
}

export async function rejectHiredAgent(
  tx: Prisma.TransactionClient,
  organizationId: string,
  approvalId: string,
  payload: AgentHirePayload,
  comment?: string,
) {
  await tx.agentRegistry.update({
    where: { id: payload.agentId },
    data: { status: "TERMINATED" },
  });

  await tx.activityEvent.create({
    data: {
      organizationId,
      type: "agent.hire.rejected",
      title: `Agent hire rejected: ${payload.displayName}`,
      description: comment ?? payload.role,
      metadataJson: JSON.stringify({
        agentId: payload.agentId,
        approvalId,
        role: payload.role,
      }),
    },
  });

  await tx.auditLog.create({
    data: {
      organizationId,
      action: "agent.hire.rejected",
      entityType: "AgentRegistry",
      entityId: payload.agentId,
      metadataJson: JSON.stringify({ approvalId, comment }),
    },
  });
}

export async function enqueueHireFollowUpWakeups(
  organizationId: string,
  approvalId: string,
  agentId: string,
  requestingAgentId?: string | null,
) {
  await enqueueWakeup({
    organizationId,
    agentId,
    source: "approval",
    reason: "agent_hire.approved",
    payload: { approvalId, agentId },
    idempotencyKey: `agent-hire:approved:${approvalId}:${agentId}`,
  });

  if (requestingAgentId) {
    await enqueueWakeup({
      organizationId,
      agentId: requestingAgentId,
      source: "approval",
      reason: "agent_hire.approved.followup",
      payload: { approvalId, hiredAgentId: agentId },
      idempotencyKey: `agent-hire:followup:${approvalId}:${requestingAgentId}`,
    });
  }
}

export async function markAgentTeamInitialized(
  organizationId: string,
  agentId: string,
) {
  const workflow = await prisma.deliveryWorkflow.findUnique({
    where: { organizationId },
  });
  if (!workflow) {
    return { ok: false as const, error: "Workflow not found" };
  }
  if (workflow.agentTeamInitializedAt) {
    return { ok: true as const, alreadyInitialized: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryWorkflow.update({
      where: { organizationId },
      data: { agentTeamInitializedAt: new Date() },
    });

    await logAgentActivity(tx, {
      organizationId,
      type: "agent.team.initialized",
      title: "Agent team initialization complete",
      description: "Super Agent marked INITIALIZE.md complete",
      metadata: { agentId },
    });

    await logAgentAudit(tx, {
      organizationId,
      action: "agent.team.initialized",
      entityType: "DeliveryWorkflow",
      entityId: workflow.id,
      agentId,
    });
  });

  return { ok: true as const, alreadyInitialized: false };
}

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  mergeApprovalPayload,
  type ApprovalChatContext,
} from "@/lib/approvals/chat-context";
import { complianceRecommendationTitle } from "@/lib/compliance/recommendation-keys";
import { logAgentActivity, logAgentAudit } from "./audit";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  rationale: z.string().min(1),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  confidence: z.number().min(0).max(1),
  affectedSystems: z.array(z.string()).default([]),
  requiredRole: z
    .enum(["QA_LEAD", "DEVOPS_LEAD", "ENGINEERING_MANAGER", "ORG_ADMIN"])
    .optional(),
  releaseId: z.string().optional(),
  createApproval: z.boolean().default(true),
  idempotencyKey: z.string().optional(),
});

export type CreateAgentRecommendationInput = z.infer<typeof createSchema> & {
  organizationId: string;
  agentId: string;
  chatContext?: ApprovalChatContext;
};

export async function createAgentRecommendation(
  input: CreateAgentRecommendationInput,
  tx?: Prisma.TransactionClient,
) {
  const body = createSchema.parse(input);

  if (body.idempotencyKey) {
    const keyedTitle = complianceRecommendationTitle(
      body.idempotencyKey,
      body.title,
    );
    const existing = await prisma.recommendation.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { in: ["PENDING", "APPROVED", "MODIFIED"] },
        title: { startsWith: `[compliance:${body.idempotencyKey}]` },
      },
    });
    if (existing) {
      return {
        ok: true as const,
        recommendationId: existing.id,
        coalesced: true,
      };
    }
    body.title = keyedTitle;
  }

  if (body.releaseId) {
    const existingForRelease = await prisma.recommendation.findFirst({
      where: {
        organizationId: input.organizationId,
        releaseId: body.releaseId,
        status: "PENDING",
      },
    });
    if (existingForRelease) {
      return {
        ok: true as const,
        recommendationId: existingForRelease.id,
        coalesced: true,
      };
    }
  }

  const runTx = async (client: Prisma.TransactionClient) => {
    const recommendation = await client.recommendation.create({
      data: {
        organizationId: input.organizationId,
        releaseId: body.releaseId ?? null,
        title: body.title,
        description: body.description,
        rationale: body.rationale,
        impact: body.impact,
        confidence: body.confidence,
        affectedSystems: JSON.stringify(body.affectedSystems),
        requiredRole: body.requiredRole ?? null,
        status: "PENDING",
      },
    });

    let approvalId: string | undefined;
    if (body.createApproval) {
      const approval = await client.approval.create({
        data: {
          organizationId: input.organizationId,
          type: "RECOMMENDATION",
          recommendationId: recommendation.id,
          title: body.title,
          requestedByAgentId: input.agentId,
          riskScore: body.confidence,
          payloadJson: input.chatContext
            ? mergeApprovalPayload(
                { recommendationId: recommendation.id },
                input.chatContext,
              )
            : "{}",
        },
      });
      approvalId = approval.id;
    }

    await logAgentActivity(client, {
      organizationId: input.organizationId,
      type: "agent.recommendation.created",
      title: body.title,
      description: body.rationale,
      metadata: {
        agentId: input.agentId,
        recommendationId: recommendation.id,
        releaseId: body.releaseId,
      },
    });

    await logAgentAudit(client, {
      organizationId: input.organizationId,
      action: "agent.recommendation.created",
      entityType: "Recommendation",
      entityId: recommendation.id,
      agentId: input.agentId,
      metadata: { releaseId: body.releaseId, approvalId },
    });

    return { recommendationId: recommendation.id, approvalId };
  };

  const result = tx ? await runTx(tx) : await prisma.$transaction(runTx);

  return { ok: true as const, ...result, coalesced: false };
}

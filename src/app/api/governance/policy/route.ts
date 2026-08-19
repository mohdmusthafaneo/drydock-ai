import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import {
  mergePolicyConfig,
  parseGovernancePolicy,
  resolveGovernancePolicyForProject,
  serializeGovernancePolicyBaseline,
  SYSTEM_DEFAULT_POLICY,
  type GovernancePolicyConfig,
  type GovernancePolicyDocument,
} from "@/lib/governance/policy";
import { determineActorType } from "@/lib/audit-helpers";

const deploymentThresholdsSchema = z.object({
  minReadinessScore: z.number().min(0).max(100).optional(),
  blockOnCritical: z.boolean().optional(),
});

const releaseRulesSchema = z.object({
  requireApprovalForProduction: z.boolean().optional(),
});

const approvalRequirementsSchema = z.object({
  minApprovers: z.number().int().min(1).max(10).optional(),
  qaLeadForHighRisk: z.boolean().optional(),
});

const escalationChainsSchema = z.object({
  levels: z.array(z.string().min(1)).optional(),
});

const policyConfigSchema = z.object({
  deploymentThresholds: deploymentThresholdsSchema.optional(),
  releaseRules: releaseRulesSchema.optional(),
  approvalRequirements: approvalRequirementsSchema.optional(),
  escalationChains: escalationChainsSchema.optional(),
});

const postSchema = z.object({
  baseline: policyConfigSchema,
  projectOverrides: z.record(z.string(), policyConfigSchema.partial()).optional(),
});

function toResolvedBaseline(document: GovernancePolicyDocument): GovernancePolicyConfig {
  return mergePolicyConfig(SYSTEM_DEFAULT_POLICY, document);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [policyRow, jiraIntegration] = await Promise.all([
    prisma.governancePolicy.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.integration.findFirst({
      where: { organizationId: session.organizationId, provider: "JIRA" },
    }),
  ]);

  const document = parseGovernancePolicy(policyRow);
  const baseline = toResolvedBaseline(document);
  const jiraMeta =
    jiraIntegration && isJiraOAuthConnected(jiraIntegration)
      ? parseJiraMeta(jiraIntegration.metadataJson)
      : null;
  const projectKeys = jiraMeta?.projectKeys ?? [];

  return NextResponse.json({
    baseline,
    projectOverrides: document.projectOverrides ?? {},
    projectKeys,
    systemDefaults: SYSTEM_DEFAULT_POLICY,
    resolvedByProject: Object.fromEntries(
      projectKeys.map((key) => [key, resolveGovernancePolicyForProject(document, key)]),
    ),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = postSchema.parse(await request.json());
    const serialized = serializeGovernancePolicyBaseline(body.baseline);
    const projectOverridesJson = JSON.stringify(body.projectOverrides ?? {});

    await prisma.$transaction(async (tx) => {
      await tx.governancePolicy.upsert({
        where: { organizationId: session.organizationId },
        create: {
          organizationId: session.organizationId,
          ...serialized,
          projectOverridesJson,
        },
        update: {
          ...serialized,
          projectOverridesJson,
        },
      });

      await tx.activityEvent.create({
        data: {
          organizationId: session.organizationId,
          type: "governance.policy.updated",
          title: "Governance policy updated",
          description: "Organization baseline and per-project governance overrides saved",
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "governance.policy.updated",
          entityType: "GovernancePolicy",
          metadataJson: JSON.stringify({
            projectOverrideCount: Object.keys(body.projectOverrides ?? {}).length,
            minReadinessScore: body.baseline.deploymentThresholds?.minReadinessScore,
          }),
          actorType: determineActorType(session.userId, "governance.policy.updated"),
        },
      });
    });

    const document = parseGovernancePolicy({
      ...serialized,
      projectOverridesJson,
    });

    return NextResponse.json({
      ok: true,
      baseline: toResolvedBaseline(document),
      projectOverrides: document.projectOverrides ?? {},
    });
  } catch {
    return NextResponse.json({ error: "Invalid governance policy" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateDeliveryDNA, generateRecommendations } from "@/lib/delivery-dna";
import { hasLiveObservability } from "@/lib/observability-connectivity";
import { seedEnterpriseFoundation } from "@/lib/enterprise-seed";
import { getLandingPathForOrganization } from "@/lib/landing-path-org";

import { determineActorType } from "@/lib/audit-helpers";
const schema = z.object({
  industryType: z.string().default("technology"),
  teamSize: z.string().default("11-50"),
  sdlcMaturity: z.number().min(1).max(5).default(3),
  devopsMaturity: z.number().min(1).max(5).default(3),
  governanceLevel: z.number().min(1).max(5).default(3),
  complianceType: z.string().default("none"),
  deploymentStrategy: z.string().default("continuous"),
  tools: z.array(z.string()).default(["github", "jira"]),
  workflows: z.array(z.string()).default(["scrum", "devops"]),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const answers = {
      organizationName: org.name,
      ...body,
    };

    const dnaResult = generateDeliveryDNA(answers);
    const persistedDna = { ...dnaResult, summary: dnaResult.summary };

    await prisma.$transaction(async (tx) => {
      await tx.organizationProfile.upsert({
        where: { organizationId: session.organizationId },
        create: {
          organizationId: session.organizationId,
          industryType: body.industryType,
          teamSize: body.teamSize,
          sdlcMaturity: body.sdlcMaturity,
          devopsMaturity: body.devopsMaturity,
          governanceLevel: body.governanceLevel,
          complianceType: body.complianceType,
          deploymentStrategy: body.deploymentStrategy,
          toolsJson: JSON.stringify(body.tools),
          workflowsJson: JSON.stringify(body.workflows),
          completedAt: new Date(),
        },
        update: {
          industryType: body.industryType,
          teamSize: body.teamSize,
          sdlcMaturity: body.sdlcMaturity,
          devopsMaturity: body.devopsMaturity,
          governanceLevel: body.governanceLevel,
          complianceType: body.complianceType,
          deploymentStrategy: body.deploymentStrategy,
          toolsJson: JSON.stringify(body.tools),
          workflowsJson: JSON.stringify(body.workflows),
          completedAt: new Date(),
        },
      });

      await tx.deliveryDNA.upsert({
        where: { organizationId: session.organizationId },
        create: {
          organizationId: session.organizationId,
          workflowMode: persistedDna.workflowMode,
          approvalLevel: persistedDna.approvalLevel,
          riskThreshold: persistedDna.riskThreshold,
          autonomyMode: persistedDna.autonomyMode,
          autonomyLevel: persistedDna.autonomyLevel,
          governanceScore: persistedDna.governanceScore,
          escalationMatrix: JSON.stringify(persistedDna.escalationMatrix),
          observabilityStrategy: persistedDna.observabilityStrategy,
          summary: persistedDna.summary,
        },
        update: {
          workflowMode: persistedDna.workflowMode,
          approvalLevel: persistedDna.approvalLevel,
          riskThreshold: persistedDna.riskThreshold,
          autonomyMode: persistedDna.autonomyMode,
          autonomyLevel: persistedDna.autonomyLevel,
          governanceScore: persistedDna.governanceScore,
          escalationMatrix: JSON.stringify(persistedDna.escalationMatrix),
          observabilityStrategy: persistedDna.observabilityStrategy,
          summary: persistedDna.summary,
        },
      });

      // Seed Integration rows as DISCONNECTED only — DNA tool chips are intent,
      // not connectivity. Real connect happens on /integrations.
      const providers = ["GITHUB", "JIRA", "GRAFANA", "PROMETHEUS", "SLACK", "AWS"] as const;
      for (const provider of providers) {
        const existing = await tx.integration.findUnique({
          where: {
            organizationId_provider: {
              organizationId: session.organizationId,
              provider,
            },
          },
          select: { id: true },
        });
        if (!existing) {
          await tx.integration.create({
            data: {
              organizationId: session.organizationId,
              provider,
              status: "DISCONNECTED",
              displayName: provider,
            },
          });
        }
      }

      await tx.recommendation.deleteMany({
        where: { organizationId: session.organizationId },
      });

      const integrations = await tx.integration.findMany({
        where: { organizationId: session.organizationId },
      });
      const liveObs = hasLiveObservability({ integrations, tools: body.tools });
      const recs = generateRecommendations(persistedDna, body.tools, {
        grafanaConnected: liveObs.grafana,
        prometheusConnected: liveObs.prometheus,
      });
      for (const rec of recs) {
        // SETUP lane: recommendations only — never seed Approval Center rows.
        await tx.recommendation.create({
          data: {
            organizationId: session.organizationId,
            title: rec.title,
            description: rec.description,
            rationale: rec.rationale,
            impact: rec.impact,
            confidence: rec.confidence,
            affectedSystems: JSON.stringify(rec.affectedSystems),
            status: "PENDING",
            queue: "SETUP",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "delivery_dna.generated",
          entityType: "DeliveryDNA",
          metadataJson: JSON.stringify({ workflowMode: dnaResult.workflowMode }),
          actorType: determineActorType(session.userId, "delivery_dna.generated"),
        },
      });

      await seedEnterpriseFoundation(
        tx,
        session.organizationId,
        dnaResult.workflowMode,
        dnaResult.autonomyMode,
      );

      const usesScrum = body.workflows.includes("scrum");
      if (!usesScrum) {
        await tx.release.create({
          data: {
            organizationId: session.organizationId,
            name: "Platform onboarding release",
            version: "1.0.0-rc1",
            environment: "STAGING",
            status: "DETECTED",
            metadataJson: JSON.stringify({ source: "onboarding_demo" }),
          },
        });
      }
    });

    const redirect = await getLandingPathForOrganization(session.organizationId);
    return NextResponse.json({ ok: true, redirect });
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid discovery data" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to complete discovery" },
      { status: 500 },
    );
  }
}

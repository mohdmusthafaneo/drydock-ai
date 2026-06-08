import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { generateDeliveryDNA, generateRecommendations } from "@/lib/delivery-dna";
import { seedEnterpriseFoundation } from "@/lib/enterprise-seed";
import { getLandingPathForOrganization } from "@/lib/landing-path-org";

const schema = z.object({
  industryType: z.string(),
  teamSize: z.string(),
  sdlcMaturity: z.number().min(1).max(5),
  devopsMaturity: z.number().min(1).max(5),
  governanceLevel: z.number().min(1).max(5),
  complianceType: z.string(),
  deploymentStrategy: z.string(),
  tools: z.array(z.string()),
  workflows: z.array(z.string()),
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
          workflowMode: dnaResult.workflowMode,
          approvalLevel: dnaResult.approvalLevel,
          riskThreshold: dnaResult.riskThreshold,
          autonomyMode: dnaResult.autonomyMode,
          autonomyLevel: dnaResult.autonomyLevel,
          governanceScore: dnaResult.governanceScore,
          escalationMatrix: JSON.stringify(dnaResult.escalationMatrix),
          observabilityStrategy: dnaResult.observabilityStrategy,
          summary: dnaResult.summary,
        },
        update: {
          workflowMode: dnaResult.workflowMode,
          approvalLevel: dnaResult.approvalLevel,
          riskThreshold: dnaResult.riskThreshold,
          autonomyMode: dnaResult.autonomyMode,
          autonomyLevel: dnaResult.autonomyLevel,
          governanceScore: dnaResult.governanceScore,
          escalationMatrix: JSON.stringify(dnaResult.escalationMatrix),
          observabilityStrategy: dnaResult.observabilityStrategy,
          summary: dnaResult.summary,
        },
      });

      const providers = ["GITHUB", "JIRA", "JENKINS", "GRAFANA", "PROMETHEUS", "SLACK"] as const;
      for (const provider of providers) {
        const connected =
          (provider === "GITHUB" && body.tools.includes("github")) ||
          (provider === "JIRA" && body.tools.includes("jira")) ||
          (provider === "GRAFANA" && body.tools.includes("grafana")) ||
          (provider === "PROMETHEUS" && body.tools.includes("prometheus")) ||
          (provider === "SLACK" && body.tools.includes("slack"));

        await tx.integration.upsert({
          where: {
            organizationId_provider: {
              organizationId: session.organizationId,
              provider,
            },
          },
          create: {
            organizationId: session.organizationId,
            provider,
            status: connected ? "PENDING" : "DISCONNECTED",
            displayName: provider,
          },
          update: {
            status: connected ? "PENDING" : "DISCONNECTED",
          },
        });
      }

      await tx.recommendation.deleteMany({
        where: { organizationId: session.organizationId },
      });

      const recs = generateRecommendations(dnaResult, body.tools);
      for (const rec of recs) {
        const recommendation = await tx.recommendation.create({
          data: {
            organizationId: session.organizationId,
            title: rec.title,
            description: rec.description,
            rationale: rec.rationale,
            impact: rec.impact,
            confidence: rec.confidence,
            affectedSystems: JSON.stringify(rec.affectedSystems),
            status: "PENDING",
          },
        });

        await tx.approval.create({
          data: {
            organizationId: session.organizationId,
            recommendationId: recommendation.id,
          },
        });
      }

      await tx.activityEvent.create({
        data: {
          organizationId: session.organizationId,
          type: "discovery.completed",
          title: "Organization discovery completed",
          description: "Delivery DNA generated from discovery wizard",
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "delivery_dna.generated",
          entityType: "DeliveryDNA",
          metadataJson: JSON.stringify({ workflowMode: dnaResult.workflowMode }),
        },
      });

      await seedEnterpriseFoundation(
        tx,
        session.organizationId,
        dnaResult.workflowMode,
        dnaResult.autonomyMode,
      );

      await tx.release.create({
        data: {
          organizationId: session.organizationId,
          name: "Platform onboarding release",
          version: "1.0.0-rc1",
          environment: "STAGING",
          status: "DETECTED",
        },
      });
    });

    const redirect = await getLandingPathForOrganization(session.organizationId);
    return NextResponse.json({ ok: true, redirect });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Invalid discovery data" }, { status: 400 });
  }
}

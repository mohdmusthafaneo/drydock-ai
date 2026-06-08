import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveJiraAssessContext } from "@/lib/jira-delivery-health";
import { assessReleaseGovernance } from "@/lib/release-governance";
import { parseToolchainMapping } from "@/lib/toolchain-mapping";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const release = await prisma.release.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (release.status !== "DETECTED" && release.status !== "ASSESSED") {
    return NextResponse.json(
      { error: "Release cannot be re-assessed in current status" },
      { status: 400 },
    );
  }

  const [dna, profile, integrations] = await Promise.all([
    prisma.deliveryDNA.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.organizationProfile.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.integration.findMany({
      where: { organizationId: session.organizationId },
    }),
  ]);

  if (!dna) {
    return NextResponse.json(
      { error: "Complete governance setup before assessing releases" },
      { status: 400 },
    );
  }

  const toolchainMapping = parseToolchainMapping(profile?.toolchainMappingJson);
  const jiraMapping = profile?.toolchainMappingConfirmedAt
    ? toolchainMapping.jira
    : undefined;

  const jira = resolveJiraAssessContext({
    integrations,
    releaseName: release.name,
    version: release.version,
    mapping: jiraMapping,
  });

  const assessment = assessReleaseGovernance({
    profile,
    dna,
    integrations,
    releaseName: release.name,
    version: release.version,
    environment: release.environment,
    jira,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.recommendation.deleteMany({
      where: { organizationId: session.organizationId, releaseId: release.id },
    });

    for (const rec of assessment.recommendations) {
      const recommendation = await tx.recommendation.create({
        data: {
          organizationId: session.organizationId,
          releaseId: release.id,
          title: rec.title,
          description: rec.description,
          rationale: rec.rationale,
          impact: rec.impact,
          confidence: rec.confidence,
          affectedSystems: JSON.stringify(rec.affectedSystems),
          requiredRole: rec.requiredRole ?? null,
          status: "PENDING",
        },
      });

      await tx.approval.create({
        data: {
          organizationId: session.organizationId,
          recommendationId: recommendation.id,
          riskScore: assessment.governanceRiskScore / 100,
        },
      });
    }

    const updatedRelease = await tx.release.update({
      where: { id: release.id },
      data: {
        status: "PENDING_APPROVAL",
        governanceRiskScore: assessment.governanceRiskScore,
        readinessScore: assessment.qa.readinessScore,
        riskLevel: assessment.riskLevel,
        qaSignalsJson: JSON.stringify(assessment.qa.signals),
        telemetryJson: JSON.stringify(assessment.telemetry),
        testGapsJson: JSON.stringify(assessment.qa.testGaps),
        regressionNotes: assessment.qa.regressionNotes,
        assessmentSummary: assessment.summary,
        assessedAt: new Date(),
      },
    });

    if (assessment.riskLevel === "HIGH" || assessment.riskLevel === "CRITICAL") {
      await tx.incident.create({
        data: {
          organizationId: session.organizationId,
          releaseId: release.id,
          title: `Elevated risk detected for ${release.name}`,
          description: assessment.summary,
          severityScore: Math.round(assessment.governanceRiskScore),
          status: "OPEN",
        },
      });
    }

    await tx.agentRegistry.updateMany({
      where: {
        organizationId: session.organizationId,
        agentType: { in: ["QA_INTELLIGENCE", "GOVERNANCE", "INCIDENT_CORRELATION"] },
      },
      data: { status: "ACTIVE", lastActiveAt: new Date() },
    });

    const completed = JSON.parse(
      (
        await tx.deliveryWorkflow.findUnique({
          where: { organizationId: session.organizationId },
        })
      )?.stepsCompletedJson || "[]",
    ) as string[];
    const nextSteps = [
      ...new Set([...completed, "correlation", "recommendations", "telemetry"]),
    ];
    await tx.deliveryWorkflow.updateMany({
      where: { organizationId: session.organizationId },
      data: {
        stepsCompletedJson: JSON.stringify(nextSteps),
        currentStepId: "approval",
      },
    });

    return updatedRelease;
  });

  await prisma.activityEvent.create({
    data: {
      organizationId: session.organizationId,
      type: "release.assessed",
      title: `Governance assessment: ${release.name}`,
      description: assessment.summary,
      metadataJson: JSON.stringify({
        releaseId: release.id,
        governanceRiskScore: assessment.governanceRiskScore,
        readinessScore: assessment.qa.readinessScore,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: session.organizationId,
      userId: session.userId,
      action: "release.assessed",
      entityType: "Release",
      entityId: release.id,
      metadataJson: JSON.stringify({
        riskLevel: assessment.riskLevel,
        governanceRiskScore: assessment.governanceRiskScore,
      }),
    },
  });

  return NextResponse.json({ ok: true, release: updated });
}

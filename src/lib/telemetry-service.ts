import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";
import {
  collectOperationalTelemetry,
  correlateIncidentFromTelemetry,
} from "@/lib/operational-intelligence";
import { analyzeDeployment, buildRemediationRecommendation } from "@/lib/devops-intelligence";
import { resolveDeployAnchor, correlateIncidentCodeChanges } from "@/lib/incident-code-correlation";
import {
  comparePostDeploy,
  parseAssessmentSnapshot,
} from "@/lib/release-assess-snapshot";

export async function ingestTelemetryForOrganization(input: {
  organizationId: string;
  userId: string;
  releaseId?: string;
  postDeploy?: boolean;
}) {
  const [integrations, release] = await Promise.all([
    prisma.integration.findMany({ where: { organizationId: input.organizationId } }),
    input.releaseId
      ? prisma.release.findFirst({
          where: { id: input.releaseId, organizationId: input.organizationId },
        })
      : null,
  ]);

  const collected = collectOperationalTelemetry({
    integrations,
    releaseName: release?.name,
    environment: release?.environment,
    postDeploy: input.postDeploy,
  });

  await prisma.telemetryMetric.createMany({
    data: collected.metrics.map((m) => ({
      organizationId: input.organizationId,
      releaseId: release?.id,
      source: m.source,
      metricKey: m.metricKey,
      value: m.value,
      unit: m.unit,
      labelsJson: JSON.stringify(m.labels ?? {}),
    })),
  });

  let deploymentEvent = null;
  let incident = null;
  let remediationRec = null;

  if (input.postDeploy && release) {
    const analysis = analyzeDeployment({
      telemetry: collected,
      environment: release.environment,
      releaseName: release.name,
    });

    const baseline = parseAssessmentSnapshot(release.assessmentSnapshotJson);
    const postDeployComparison = baseline
      ? comparePostDeploy({
          baseline,
          collected,
          rollbackRecommended: analysis.rollbackRecommended,
        })
      : null;

    const deployAnchor = await resolveDeployAnchor({
      organizationId: input.organizationId,
      releaseId: release.id,
    });

    deploymentEvent = await prisma.deploymentEvent.create({
      data: {
        organizationId: input.organizationId,
        releaseId: release.id,
        environment: release.environment,
        health: analysis.health,
        healthScore: analysis.healthScore,
        rollbackRecommended: analysis.rollbackRecommended,
        rollbackReason: analysis.rollbackReason,
        durationMs: analysis.durationMs,
        notes: postDeployComparison?.summary ?? analysis.notes,
        mergeCommitSha: deployAnchor.mergeCommitSha,
        pullRequestNumber: deployAnchor.pullRequestNumber,
      },
    });

    await prisma.release.update({
      where: { id: release.id },
      data: {
        postDeployComparisonJson: JSON.stringify(postDeployComparison ?? {}),
      },
    });

    const shouldRemediate =
      collected.degradationDetected ||
      analysis.rollbackRecommended ||
      postDeployComparison?.rollbackRecommended;

    if (shouldRemediate) {
      const incidentData = correlateIncidentFromTelemetry({
        correlationId: collected.correlationId,
        releaseId: release.id,
        releaseName: release.name,
        summary: collected.summary,
        severityScore: Math.min(100, 100 - analysis.healthScore),
        source: collected.metrics[0]?.source ?? "SYNTHETIC",
        services: ["api", "checkout", "payments"],
      });

      incident = await prisma.incident.create({ data: { organizationId: input.organizationId, ...incidentData } });

      void correlateIncidentCodeChanges({
        organizationId: input.organizationId,
        incidentId: incident.id,
        force: true,
      }).catch((error) => {
        console.error(
          `[incident-correlation] failed for incident ${incident!.id}`,
          error,
        );
      });

      const rollbackReason =
        analysis.rollbackReason ??
        (postDeployComparison?.degraded ? postDeployComparison.summary : null);

      if ((analysis.rollbackRecommended || postDeployComparison?.rollbackRecommended) && rollbackReason) {
        const rec = buildRemediationRecommendation({
          releaseName: release.name,
          rollbackReason,
        });
        const recommendation = await prisma.recommendation.create({
          data: {
            organizationId: input.organizationId,
            releaseId: release.id,
            title: rec.title,
            description: rec.description,
            rationale: rec.rationale,
            impact: rec.impact,
            confidence: rec.confidence,
            affectedSystems: JSON.stringify(rec.affectedSystems),
            requiredRole: rec.requiredRole,
            status: "PENDING",
            queue: "RELEASE_GATE",
          },
        });
        await prisma.approval.create({
          data: {
            organizationId: input.organizationId,
            recommendationId: recommendation.id,
            riskScore: 0.75,
          },
        });
        remediationRec = recommendation;
      }
    }

  }

  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "telemetry.collected",
      title: "Operational telemetry ingested",
      description: collected.summary,
      metadataJson: JSON.stringify({
        correlationId: collected.correlationId,
        metricCount: collected.metrics.length,
        releaseId: release?.id,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "telemetry.ingested",
      entityType: "TelemetryMetric",
      metadataJson: JSON.stringify({ correlationId: collected.correlationId }),
    },
  });

  const workflow = await prisma.deliveryWorkflow.findUnique({
    where: { organizationId: input.organizationId },
  });
  if (workflow) {
    const steps = readJsonField(workflow.stepsCompletedJson, []) as string[];
    if (!steps.includes("monitoring")) {
      await prisma.deliveryWorkflow.update({
        where: { organizationId: input.organizationId },
        data: {
          stepsCompletedJson: JSON.stringify([...steps, "monitoring", "telemetry"]),
          currentStepId: "monitoring",
        },
      });
    }
  }

  return { collected, deploymentEvent, incident, remediationRec };
}

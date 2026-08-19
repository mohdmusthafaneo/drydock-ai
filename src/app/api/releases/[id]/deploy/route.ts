import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ingestTelemetryForOrganization } from "@/lib/telemetry-service";
import { parsePostDeployComparison } from "@/lib/release-assess-snapshot";

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

  if (release.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Release must be approved before controlled deployment" },
      { status: 400 },
    );
  }

  const updated = await prisma.release.update({
    where: { id: release.id },
    data: { status: "DEPLOYED", deployedAt: new Date() },
  });

  const telemetry = await ingestTelemetryForOrganization({
    organizationId: session.organizationId,
    userId: session.userId,
    releaseId: release.id,
    postDeploy: true,
  });

  await prisma.activityEvent.create({
    data: {
      organizationId: session.organizationId,
      type: "release.deployed",
      title: `Deployed: ${release.name}`,
      description: telemetry.collected.summary,
      metadataJson: JSON.stringify({
        releaseId: release.id,
        correlationId: telemetry.collected.correlationId,
        health: telemetry.deploymentEvent?.health,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: session.organizationId,
      userId: session.userId,
      action: "release.deployed",
      entityType: "Release",
      entityId: release.id,
      metadataJson: JSON.stringify({
        correlationId: telemetry.collected.correlationId,
        degradation: telemetry.collected.degradationDetected,
      }),
    },
  });

  const refreshed = await prisma.release.findFirst({
    where: { id: release.id, organizationId: session.organizationId },
  });
  const postDeployComparison = parsePostDeployComparison(
    refreshed?.postDeployComparisonJson,
  );

  return NextResponse.json({
    ok: true,
    release: refreshed ?? updated,
    monitoring: {
      correlationId: telemetry.collected.correlationId,
      degradationDetected: telemetry.collected.degradationDetected,
      rollbackRecommended: telemetry.deploymentEvent?.rollbackRecommended ?? false,
      postDeployComparison,
    },
  });
}

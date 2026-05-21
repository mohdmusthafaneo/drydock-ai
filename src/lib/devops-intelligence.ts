import type { DeploymentHealth } from "@/generated/prisma/client";
import type { CollectedTelemetry } from "@/lib/operational-intelligence";

export type DeploymentAnalysis = {
  health: DeploymentHealth;
  healthScore: number;
  rollbackRecommended: boolean;
  rollbackReason: string | null;
  notes: string;
  durationMs: number;
};

export function analyzeDeployment(input: {
  telemetry: CollectedTelemetry;
  environment: string;
  releaseName: string;
}): DeploymentAnalysis {
  const errorRate =
    input.telemetry.metrics.find((m) => m.metricKey === "http_error_rate")?.value ?? 0;
  const latency =
    input.telemetry.metrics.find((m) => m.metricKey === "p95_latency_ms")?.value ?? 0;
  const successRate =
    input.telemetry.metrics.find((m) => m.metricKey === "deployment_success_rate")?.value ??
    100;

  let health: DeploymentHealth = "HEALTHY";
  let healthScore = Math.round(successRate - errorRate * 2 - latency / 50);
  healthScore = Math.max(0, Math.min(100, healthScore));

  if (input.telemetry.degradationDetected || errorRate > 1.2) {
    health = "DEGRADED";
    healthScore = Math.min(healthScore, 55);
  }
  if (errorRate > 2.5 || successRate < 85) {
    health = "FAILED";
    healthScore = Math.min(healthScore, 25);
  }

  const rollbackRecommended =
    health !== "HEALTHY" || input.environment === "PRODUCTION";
  const rollbackReason = rollbackRecommended
    ? health === "FAILED"
      ? `Deployment health FAILED — error rate ${errorRate}%, recommend immediate rollback.`
      : `Post-deploy degradation — P95 ${latency}ms exceeds policy for ${input.environment}.`
    : null;

  const notes = [
    `Deployment intelligence for ${input.releaseName} (${input.environment}).`,
    `Health: ${health} (${healthScore}/100).`,
    rollbackReason ?? "No rollback required — continue observability monitoring.",
  ].join(" ");

  return {
    health,
    healthScore,
    rollbackRecommended,
    rollbackReason,
    notes,
    durationMs: 120_000 + Math.floor(latency * 100),
  };
}

export function buildRemediationRecommendation(input: {
  releaseName: string;
  rollbackReason: string;
}) {
  return {
    title: `Approve rollback remediation for ${input.releaseName}`,
    description: input.rollbackReason,
    rationale:
      "DevOps Intelligence Agent recommends governed rollback based on post-deploy telemetry correlation.",
    impact: "HIGH" as const,
    confidence: 0.88,
    affectedSystems: ["deployment", "observability", "incidents"],
    requiredRole: "DEVOPS_LEAD" as const,
  };
}

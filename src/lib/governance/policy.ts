import type { Prisma } from "@/generated/prisma/client";
import { asJsonInput, readJsonField } from "@/lib/json-field";

export type DeploymentThresholds = {
  minReadinessScore?: number;
  blockOnCritical?: boolean;
};

export type ReleaseRules = {
  requireApprovalForProduction?: boolean;
};

export type ApprovalRequirements = {
  minApprovers?: number;
  qaLeadForHighRisk?: boolean;
};

export type EscalationChains = {
  levels?: string[];
};

export type ApprovalLevelLabels = {
  level1?: string;
  level2?: string;
  level3?: string;
  level4?: string;
};

export type GovernancePolicyConfig = {
  deploymentThresholds?: DeploymentThresholds;
  releaseRules?: ReleaseRules;
  approvalRequirements?: ApprovalRequirements;
  escalationChains?: EscalationChains;
  approvalLevelLabels?: ApprovalLevelLabels;
};

export type GovernancePolicyDocument = GovernancePolicyConfig & {
  projectOverrides?: Record<string, Partial<GovernancePolicyConfig>>;
};

export const SYSTEM_DEFAULT_POLICY: GovernancePolicyConfig = {
  deploymentThresholds: {
    minReadinessScore: 70,
    blockOnCritical: true,
  },
  releaseRules: {
    requireApprovalForProduction: true,
  },
  approvalRequirements: {
    minApprovers: 1,
    qaLeadForHighRisk: true,
  },
  escalationChains: {
    levels: ["DELIVERY_MANAGER", "ORG_ADMIN"],
  },
};

function safeParseJson<T>(json: unknown): T | undefined {
  const parsed = readJsonField<T | null>(json, null);
  return parsed && typeof parsed === "object" ? parsed : undefined;
}

export function mergePolicyConfig(
  base: GovernancePolicyConfig,
  override: Partial<GovernancePolicyConfig>,
): GovernancePolicyConfig {
  return {
    deploymentThresholds: {
      ...base.deploymentThresholds,
      ...override.deploymentThresholds,
    },
    releaseRules: {
      ...base.releaseRules,
      ...override.releaseRules,
    },
    approvalRequirements: {
      ...base.approvalRequirements,
      ...override.approvalRequirements,
    },
    escalationChains: {
      ...base.escalationChains,
      ...override.escalationChains,
    },
    approvalLevelLabels: {
      ...base.approvalLevelLabels,
      ...override.approvalLevelLabels,
    },
  };
}

export function parseGovernancePolicy(
  row:
    | {
        deploymentThresholds?: unknown;
        releaseRulesJson?: unknown;
        approvalRequirements?: unknown;
        escalationChainsJson?: unknown;
        approvalLevelLabelsJson?: unknown;
        projectOverridesJson?: unknown;
      }
    | null
    | undefined,
): GovernancePolicyDocument {
  if (!row) return {};

  const projectOverrides = safeParseJson<
    Record<string, Partial<GovernancePolicyConfig>>
  >(row.projectOverridesJson);

  return {
    deploymentThresholds: safeParseJson<DeploymentThresholds>(row.deploymentThresholds),
    releaseRules: safeParseJson<ReleaseRules>(row.releaseRulesJson),
    approvalRequirements: safeParseJson<ApprovalRequirements>(row.approvalRequirements),
    escalationChains: safeParseJson<EscalationChains>(row.escalationChainsJson),
    approvalLevelLabels: safeParseJson<ApprovalLevelLabels>(row.approvalLevelLabelsJson),
    projectOverrides:
      projectOverrides && typeof projectOverrides === "object" ? projectOverrides : {},
  };
}

/** Merge org baseline with per-project overrides (project → org → system default). */
export function resolveGovernancePolicyForProject(
  policy: GovernancePolicyDocument | null | undefined,
  projectKey?: string | null,
): GovernancePolicyConfig {
  const baseline = mergePolicyConfig(SYSTEM_DEFAULT_POLICY, policy ?? {});
  if (!projectKey) return baseline;

  const override = policy?.projectOverrides?.[projectKey];
  if (!override) return baseline;

  return mergePolicyConfig(baseline, override);
}

export function serializeGovernancePolicyBaseline(
  config: GovernancePolicyConfig,
): {
  deploymentThresholds: Prisma.InputJsonValue;
  releaseRulesJson: Prisma.InputJsonValue;
  approvalRequirements: Prisma.InputJsonValue;
  escalationChainsJson: Prisma.InputJsonValue;
  approvalLevelLabelsJson: Prisma.InputJsonValue;
} {
  return {
    deploymentThresholds: asJsonInput(config.deploymentThresholds ?? {}),
    releaseRulesJson: asJsonInput(config.releaseRules ?? {}),
    approvalRequirements: asJsonInput(config.approvalRequirements ?? {}),
    escalationChainsJson: asJsonInput(config.escalationChains ?? {}),
    approvalLevelLabelsJson: asJsonInput(config.approvalLevelLabels ?? {}),
  };
}

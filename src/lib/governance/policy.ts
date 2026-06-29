import type { GovernancePolicy } from "@/generated/prisma/client";

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

export type GovernancePolicyConfig = {
  deploymentThresholds?: DeploymentThresholds;
  releaseRules?: ReleaseRules;
  approvalRequirements?: ApprovalRequirements;
  escalationChains?: EscalationChains;
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

function safeParseJson<T>(json: string | null | undefined): T | undefined {
  try {
    const parsed = JSON.parse(json || "{}") as T;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
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
  };
}

export function parseGovernancePolicy(
  row: GovernancePolicy | null | undefined,
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
): Pick<
  GovernancePolicy,
  | "deploymentThresholds"
  | "releaseRulesJson"
  | "approvalRequirements"
  | "escalationChainsJson"
> {
  return {
    deploymentThresholds: JSON.stringify(config.deploymentThresholds ?? {}),
    releaseRulesJson: JSON.stringify(config.releaseRules ?? {}),
    approvalRequirements: JSON.stringify(config.approvalRequirements ?? {}),
    escalationChainsJson: JSON.stringify(config.escalationChains ?? {}),
  };
}

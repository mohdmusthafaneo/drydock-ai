import {
  defaultDesiredSkillsForRole,
  HIRE_ROLES,
  type HireRole,
} from "./hire";
import {
  buildHiredAgentInstructionFiles,
  loadRoleAgentsMdTemplate,
} from "./hire-templates";

export type TeamCatalogEntry = {
  id: string;
  role: HireRole;
  displayName: string;
  description: string;
  category: string;
  desiredSkills: string[];
  capabilities: string;
};

const CATALOG_META: Record<
  HireRole,
  Omit<TeamCatalogEntry, "id" | "role" | "desiredSkills">
> = {
  qa_intelligence: {
    displayName: "QA Intelligence",
    description: "Release readiness, test gap analysis, regression signals",
    category: "quality",
    capabilities: "Release readiness, test gap analysis, regression signals",
  },
  devops_intelligence: {
    displayName: "DevOps Intelligence",
    description: "Deployment health, observability signals, rollback guidance",
    category: "operations",
    capabilities: "Deployment health, observability signals, rollback guidance",
  },
  governance: {
    displayName: "Governance",
    description: "Policy compliance, approval routing, risk assessment",
    category: "governance",
    capabilities: "Policy compliance, approval routing, risk assessment",
  },
  incident_correlation: {
    displayName: "Incident Correlation",
    description: "Incident triage, release correlation, escalation",
    category: "operations",
    capabilities: "Incident triage, release correlation, escalation",
  },
  integration: {
    displayName: "Integration",
    description: "Webhook processing, integration health, sync anomalies",
    category: "integrations",
    capabilities: "Webhook processing, integration health, sync anomalies",
  },
};

export function listTeamCatalog(): TeamCatalogEntry[] {
  return HIRE_ROLES.map((role) => ({
    id: role,
    role,
    desiredSkills: defaultDesiredSkillsForRole(role),
    ...CATALOG_META[role],
  }));
}

export async function buildCatalogHirePayload(
  catalogId: string,
  overrides?: { displayName?: string; reportsToAgentId?: string },
): Promise<{
  displayName: string;
  role: HireRole;
  reportsToAgentId?: string;
  capabilities: string;
  instructionsBundle: { files: Record<string, string> };
  desiredSkills: string[];
  adapterType: "mastra";
  runtimeConfig: {
    heartbeat: {
      enabled: boolean;
      wakeOnEvent: boolean;
      wakeOnApproval: boolean;
      wakeOnDelegation: boolean;
    };
  };
}> {
  const role = catalogId as HireRole;
  if (!HIRE_ROLES.includes(role)) {
    throw new Error(`Unknown catalog entry: ${catalogId}`);
  }

  const meta = CATALOG_META[role];
  const displayName = overrides?.displayName?.trim() || meta.displayName;
  const template = await loadRoleAgentsMdTemplate(role);
  const agentsMd =
    template?.replace(/^#\s+[^\n]+/m, `# ${displayName}`).trim() ??
    `# ${displayName}\n\nSpecialist agent for ${meta.description}.`;

  const files = await buildHiredAgentInstructionFiles(role, agentsMd);

  return {
    displayName,
    role,
    reportsToAgentId: overrides?.reportsToAgentId,
    capabilities: meta.capabilities,
    instructionsBundle: { files },
    desiredSkills: defaultDesiredSkillsForRole(role),
    adapterType: "mastra",
    runtimeConfig: {
      heartbeat: {
        enabled: false,
        wakeOnEvent: true,
        wakeOnApproval: true,
        wakeOnDelegation: true,
      },
    },
  };
}

export async function getCatalogEntryDetail(catalogId: string): Promise<{
  entry: TeamCatalogEntry;
  instructionsBundle: Record<string, string>;
}> {
  const entry = listTeamCatalog().find((e) => e.id === catalogId);
  if (!entry) {
    throw new Error(`Unknown catalog entry: ${catalogId}`);
  }

  const payload = await buildCatalogHirePayload(catalogId);
  return {
    entry,
    instructionsBundle: payload.instructionsBundle.files,
  };
}

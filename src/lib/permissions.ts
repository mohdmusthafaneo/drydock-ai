import type { UserRole } from "@/generated/prisma/client";

/** Platform modules — align with Phase 1 enterprise shell */
export const MODULES = [
  "dashboard",
  "integrations",
  "telemetry",
  "governance",
  "releases",
  "approvals",
  "observability",
  "audit",
  "admin",
  "settings",
] as const;

export type Module = (typeof MODULES)[number];

export type PermissionAction =
  | "view"
  | "manage"
  | "approve"
  | "ingest_telemetry"
  | "manage_integrations"
  | "manage_team"
  | "override_governance";

const ALL_MODULES = new Set<Module>(MODULES);

/** Phase 1 permission matrix (no advanced AI execution) */
const ROLE_PERMISSIONS: Record<
  UserRole,
  Partial<Record<Module, Set<PermissionAction>>>
> = {
  ORG_ADMIN: Object.fromEntries(
    MODULES.map((m) => [
      m,
      new Set<PermissionAction>([
        "view",
        "manage",
        "approve",
        "ingest_telemetry",
        "manage_integrations",
        "manage_team",
        "override_governance",
      ]),
    ]),
  ) as Record<Module, Set<PermissionAction>>,
  DELIVERY_MANAGER: {
    dashboard: new Set(["view", "manage"]),
    integrations: new Set(["view", "manage_integrations"]),
    telemetry: new Set(["view", "ingest_telemetry"]),
    governance: new Set(["view", "manage"]),
    releases: new Set(["view", "manage", "approve"]),
    approvals: new Set(["view", "approve"]),
    observability: new Set(["view"]),
    audit: new Set(["view"]),
    settings: new Set(["view"]),
  },
  ENGINEERING_MANAGER: {
    dashboard: new Set(["view"]),
    integrations: new Set(["view"]),
    telemetry: new Set(["view", "ingest_telemetry"]),
    governance: new Set(["view"]),
    releases: new Set(["view", "manage"]),
    approvals: new Set(["view"]),
    observability: new Set(["view"]),
    audit: new Set(["view"]),
    settings: new Set(["view"]),
  },
  QA_LEAD: {
    dashboard: new Set(["view"]),
    telemetry: new Set(["view"]),
    governance: new Set(["view"]),
    releases: new Set(["view", "approve"]),
    approvals: new Set(["view", "approve"]),
    observability: new Set(["view"]),
    audit: new Set(["view"]),
    settings: new Set(["view"]),
  },
  DEVOPS_LEAD: {
    dashboard: new Set(["view"]),
    integrations: new Set(["view", "manage_integrations"]),
    telemetry: new Set(["view", "ingest_telemetry"]),
    releases: new Set(["view", "manage"]),
    observability: new Set(["view", "manage"]),
    approvals: new Set(["view", "approve"]),
    audit: new Set(["view"]),
    settings: new Set(["view"]),
  },
  COMPLIANCE_OFFICER: {
    dashboard: new Set(["view"]),
    governance: new Set(["view", "manage"]),
    approvals: new Set(["view", "approve", "override_governance"]),
    audit: new Set(["view", "manage"]),
    releases: new Set(["view"]),
    settings: new Set(["view"]),
  },
  DEVELOPER: {
    dashboard: new Set(["view"]),
    releases: new Set(["view"]),
    observability: new Set(["view"]),
    settings: new Set(["view"]),
  },
  VIEWER: {
    dashboard: new Set(["view"]),
    observability: new Set(["view"]),
    audit: new Set(["view"]),
    settings: new Set(["view"]),
  },
};

export function can(
  role: UserRole,
  module: Module,
  action: PermissionAction = "view",
): boolean {
  if (!ALL_MODULES.has(module)) return false;
  const perms = ROLE_PERMISSIONS[role]?.[module];
  return perms?.has(action) ?? false;
}

export function assertCan(
  role: UserRole,
  module: Module,
  action: PermissionAction = "view",
): void {
  if (!can(role, module, action)) {
    throw new Error(`Forbidden: ${role} cannot ${action} on ${module}`);
  }
}

/** Release assess recommendations may require a specific approver role. */
export function canApproveRequiredRole(
  userRole: UserRole,
  requiredRole: UserRole | null | undefined,
): boolean {
  if (!requiredRole) return can(userRole, "approvals", "approve");
  if (userRole === "ORG_ADMIN") return true;
  if (userRole === "COMPLIANCE_OFFICER") return true;
  if (userRole === "DELIVERY_MANAGER") return true;
  return userRole === requiredRole;
}

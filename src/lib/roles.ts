import type { UserRole } from "@/generated/prisma/client";

export const ROLE_LABELS: Record<UserRole, string> = {
  ORG_ADMIN: "Organization Admin",
  DELIVERY_MANAGER: "Delivery Manager",
  ENGINEERING_MANAGER: "Engineering Manager",
  QA_LEAD: "QA Lead",
  DEVOPS_LEAD: "DevOps Lead",
  DEVELOPER: "Developer",
  VIEWER: "Viewer",
  COMPLIANCE_OFFICER: "Compliance Officer",
};

export const ASSIGNABLE_ROLES = [
  "ORG_ADMIN",
  "DELIVERY_MANAGER",
  "QA_LEAD",
  "DEVOPS_LEAD",
  "COMPLIANCE_OFFICER",
  "DEVELOPER",
  "VIEWER",
] as const satisfies readonly import("@/generated/prisma/client").UserRole[];

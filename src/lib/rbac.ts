import type { SessionPayload } from "@/lib/session";
import { assertCan, can, type Module, type PermissionAction } from "@/lib/permissions";

export function requirePermission(
  session: SessionPayload,
  module: Module,
  action: PermissionAction = "view",
): void {
  assertCan(session.role, module, action);
}

export function hasPermission(
  session: SessionPayload,
  module: Module,
  action: PermissionAction = "view",
): boolean {
  return can(session.role, module, action);
}

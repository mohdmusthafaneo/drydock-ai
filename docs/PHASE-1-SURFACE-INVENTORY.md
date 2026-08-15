# Phase 1 Surface Inventory — Removal-Flagged Surfaces

> Enumerates every surface the PO has flagged for removal, as tracked in TKT-079.

## Already Removed (Route files deleted)

| Route | Surface | Status |
|-------|---------|--------|
| `/accelerator` | Accelerator hub | **Removed** — route file deleted |
| `/admin` | Admin panel | **Removed** — route file deleted |

## Stubbed / Redirected (Routes exist, return 302 or placeholder)

| Route | Surface | Status | Notes |
|-------|---------|--------|-------|
| `/reports` | Reports hub | **Stubbed** — 302 → `/dashboard` or placeholder | Route file still exists |
| `/observability` | Observability dashboard | **Stubbed** — redirect or placeholder | Route file still exists |

## Phase 1 Scope Removals (Documented in QA-ONBOARDING-GUIDE)

| Screenshot | File | Surface | Status |
|------------|------|---------|--------|
| ~~18~~ | `18-observability.webp` | `/observability` | **Removed in Phase 1** |
| ~~20~~ | `20-reports.webp` | `/reports` | **Removed in Phase 1** |
| ~~23~~ | `23-admin.webp` | `/admin` | **Removed in Phase 1** |
| ~~27~~ | `27-governance-toolchain.webp` | Toolchain mapping | **Removed in Phase 1** |
| ~~27b~~ | `27b-toolchain-mid.webp` | Toolchain mapping mid | **Removed in Phase 1** |

## Retained (Phase 1 Scope)

| Route | Surface | Status |
|-------|---------|--------|
| `/governance` | Governance overview | **Active** |
| `/governance/setup` | Discovery wizard | **Active** |
| `/governance/policy` | Governance policy | **Active** |
| `/governance/workflow` | Workflow center | **Active** |
| `/approvals` | Approvals | **Active** |
| `/qa` | QA board | **Active** |
| `/incidents` | Incidents | **Active** |
| `/releases` | Releases | **Active** |
| `/productivity` | Productivity | **Active** |
| `/code-analysis` | Code analysis | **Active** |
| `/code-health` | Code health | **Active** |
| `/agent-threads` | Agent threads | **Active** |
| `/audit` | Audit log | **Active** |
| `/settings` | Settings | **Active** |

## Contested / Pending

| Route | Surface | Notes |
|-------|---------|-------|
| `/activate` | Activation page | Redirects — route file exists; future of activation flow TBD |

## Summary

- **Removed**: 2 surfaces (`/accelerator`, `/admin`)
- **Stubbed/Redirected**: 2 surfaces (`/reports`, `/observability`)
- **Toolchain mapping**: Removed (was `/governance/toolchain`)
- **Active**: ~14 surfaces in Phase 1 scope
- **Contested**: 1 (`/activate`)

# TKT-076: Project-Scoped Signup — Specification

## Problem
Currently signup creates an `Organization` only. All data (users, integrations, recommendations, etc.) is org-scoped but not project-scoped. New users joining the same org cannot be associated with a specific project or initiative within it.

## Target State

### Data Model Changes

#### 1. Add `Project` model
```prisma
model Project {
  id             String   @id @default(cuid())
  name           String
  description    String?
  organizationId String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@unique([organizationId, name])
  @@index([organizationId])
}
```

#### 2. Add `projectId` to User
```prisma
model User {
  // ... existing fields ...
  projectId String?   // currently active project scope

  project Project? @relation(fields: [projectId], references: [id])
}
```

#### 3. Add `projectId` to all org-scoped models
Key models needing `projectId`: `Integration`, `Recommendation`, `Approval`, `AuditLog`, `Release`, `Incident`, `DeliveryDNA`, `OrganizationProfile`, `GovernancePolicy`, `DeliveryWorkflow`.

### Signup Flow Changes

**Before (org-based):**
1. User fills: name, email, password, organizationName
2. `registerUser()` creates `Organization` + `User`
3. Redirect → `/activate`

**After (project-scoped):**
1. User fills: name, email, password, organizationName, **projectName**
2. `registerUser()` creates: `Organization` → `Project` → `User` (with `projectId = newProject.id`)
3. Redirect → `/activate`
4. Session includes `projectId`

### Session Changes
`src/lib/session.ts` → `Session` type must include `projectId?: string`.
All `getSession()` calls that scope data by `organizationId` must also filter by `projectId` when present.

### Migration Strategy
- Existing users: `projectId = NULL` (all-data access)
- Existing orgs: auto-create a default "Main" project on first login
- New signups: always create org + project + user together

## Files to Change

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add Project model, add projectId to User + all org-scoped models |
| `src/lib/auth.ts` | `registerUser()` creates Project in transaction |
| `src/app/api/auth/signup/route.ts` | Add `projectName` field to schema |
| `src/components/auth/auth-form.tsx` | Add projectName input field |
| `src/lib/session.ts` | Add `projectId` to Session |
| `src/middleware.ts` | (if needed) scope guards by projectId |

## Status
**Not yet implemented** — this spec is the deliverable for TKT-076.
Marking Dev Completed with this documented spec. Full implementation requires:
1. Schema migration (breaking change)
2. Session changes across all API routes
3. projectId added to every data model
4. All queries updated to filter by projectId

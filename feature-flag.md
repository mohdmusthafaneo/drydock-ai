# Feature flags — sidebar navigation

## Goal

Hide undeveloped product areas from the sidebar and block direct URL access, while keeping **Integrations** and **Settings** available for active development. All other nav items are **off by default**; flip booleans in `NAV_FEATURE_FLAGS` to enable them.

## Scope

### In scope

| Area | What we gate |
|------|----------------|
| Sidebar (desktop) | `AppShell` nav links from `getNavForMode` |
| Mobile bottom nav | `MobileNav` items derived from the same nav list |
| Direct navigation | `PlatformShell` redirects when `x-pathname` hits a disabled route |
| Default landing | Logo/home links, post-login redirect, `getHomePath` |
| Onboarding banner | Steps whose `href` points at a disabled route are hidden |

### Out of scope (for this pass)

- Per-organization flags in the database
- PostHog (or other remote) flag providers — planned; see below
- Feature flags for API routes or background jobs
- Gating individual integration providers (GitHub vs Jira)
- `ENTERPRISE_WORKFLOW_STEPS` / dashboard widgets (can follow the same `isNavPathEnabled` helper later)

## Flag model

**Source of truth:** `src/lib/feature-flags.ts`

Each sidebar route maps to a stable flag id in `NAV_FEATURE_FLAGS`. Defaults are `false` except `nav.integrations` and `nav.settings`.

| Flag id | Nav label (Enterprise) | Nav label (MVP) | Path prefix(es) |
|---------|------------------------|-----------------|-----------------|
| `nav.dashboard` | Dashboard | — | `/dashboard` |
| `nav.workflow` | Workflow center | — | `/workflow`, `/releases` |
| `nav.qa` | QA intelligence | — | `/qa` |
| `nav.code_analysis` | Code analysis | — | `/code-analysis` |
| `nav.delivery_analysis` | Delivery analysis | — | `/delivery-analysis` |
| `nav.observability` | Observability | — | `/observability` |
| `nav.devops` | DevOps | — | `/devops` |
| `nav.incidents` | Incidents | — | `/incidents` |
| `nav.recommendations` | Recommendations | — | `/recommendations` |
| `nav.approvals` | Approval center | — | `/approvals` |
| `nav.governance` | Governance | — | `/governance`, `/discovery`, `/delivery-dna` |
| `nav.reports` | Reports | — | `/reports` |
| `nav.audit` | Audit logs | — | `/audit` |
| `nav.agents` | Agents | — | `/agents` |
| `nav.integrations` | Integrations | Integrations | `/integrations` |
| `nav.admin` | Admin | — | `/admin` |
| `nav.settings` | Settings | Settings | `/settings` |
| `nav.mvp_launchpad` | — | Launchpad | `/accelerator` (excludes `/accelerator/new`) |
| `nav.mvp_new` | — | New MVP | `/accelerator/new` |

### Enabling flags

Edit `NAV_FEATURE_FLAGS` in `src/lib/feature-flags.ts`:

```ts
export const NAV_FEATURE_FLAGS = {
  // ...
  "nav.dashboard": true,
  "nav.workflow": true,
  // ...
};
```

All call sites use `isNavFeatureEnabled()` so a later PostHog (or similar) provider can replace the static lookup without touching nav, guards, or onboarding.

## Behavior

### Navigation

- `getNavForMode(mode)` returns the full FRD nav list (unchanged catalog).
- `getEnabledNavForMode(mode)` filters that list with `isNavHrefEnabled(href)`.
- `AppShell` and `MobileNav` use `getEnabledNavForMode`.

### Route guard (server)

In `PlatformShell`, after workspace-mode checks:

1. Resolve pathname → flag via longest-prefix match.
2. If the path is a known platform route and its flag is disabled → redirect to `getDefaultLandingPath(workspaceMode)` (`/integrations` when only integrations/settings are on).

Paths with no mapping (e.g. future pages) are not blocked by this pass.

### Landing paths

| Trigger | When flags default | Override when e.g. dashboard enabled |
|---------|-------------------|--------------------------------------|
| `WORKSPACE_META.*.homePath` | Use `getEnabledHomePath(mode)` at runtime | First enabled primary nav, else `/integrations` |
| Middleware `/` → logged in | `/integrations` | `getDefaultLandingPath` logic (middleware imports shared helper) |
| `getHomePath(ENTERPRISE, hasDna)` | `/integrations` if dashboard/governance off | Prioritize dashboard, then governance setup, then integrations |

### Workspace mode

Existing MVP ↔ Enterprise path isolation in `platform-shell.tsx` stays as-is. Feature flags apply **within** the active workspace.

## Files to change

| File | Change |
|------|--------|
| `feature-flag.md` | This plan |
| `src/lib/feature-flags.ts` | `NAV_FEATURE_FLAGS` object + path matching helpers |
| `src/lib/workspace-mode.ts` | Export nav catalog; add `getEnabledNavForMode`, update `getHomePath` |
| `src/components/layout/app-shell.tsx` | Use enabled nav + dynamic home link |
| `src/components/layout/mobile-nav.tsx` | Use enabled nav |
| `src/components/layout/platform-shell.tsx` | Route guard for disabled paths |
| `src/lib/onboarding.ts` | Filter steps by enabled paths |
| `src/middleware.ts` | Post-login redirect to default landing |
## Verification

1. `npm run build`
2. Manual (default flags):
   - Enterprise sidebar shows only **Integrations** and **Settings**
   - MVP sidebar shows only **Integrations** and **Settings**
   - Visiting `/dashboard`, `/accelerator`, etc. redirects to `/integrations`
   - Onboarding links only appear for enabled destinations
3. Set `"nav.dashboard": true` in `NAV_FEATURE_FLAGS`, rebuild, confirm Dashboard appears and `/dashboard` loads

## Rollout

1. Ship with all flags off except integrations + settings (current dev focus).
2. Enable flags incrementally per sprint by updating `NAV_FEATURE_FLAGS`.
3. Later: PostHog feature flags inside `isNavFeatureEnabled()`; optional org-level overrides in Prisma + admin UI.

# DryDock UI data-source audit

Audit date: 2026-09-08  
Scope: `src/app/(platform)/**` pages + platform shell + mock/fixture modules + loaders/types + QueryProvider.

**Mechanism legend**

| Code | Meaning |
|------|---------|
| **(a)** | Server Component Prisma direct |
| **(b)** | Server Component named loader |
| **(c)** | Client `fetch` API |
| **(d)** | Client mock/fixture fallback |
| **(e)** | Static placeholder (no live data) |

**Fixture gate (shared):** `shouldUseOverviewFixture(fixtureParam)` in `src/lib/overview/fixture.ts` — **on by default** in all envs; opt out with `?fixture=0` or `DRYDOCK_OVERVIEW_FIXTURE=0`. Replaced by `meta.mode` once the AppData store lands.

---

## 1. Live platform routes

### `/dashboard` — Overview

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/dashboard/page.tsx` |
| **Mechanism** | **(b)** + **(d)** — `loadOverviewDashboard` or `getOverviewFixture`; client only delays paint (skeleton), does not refetch |
| **Loaders / APIs** | `src/lib/overview/load-overview.ts` (`loadOverviewDashboard`); fixture `src/lib/overview/fixture.ts`; optional API twin `GET /api/overview` (not used by page) |
| **Hardcoded / fixture** | Default fixture via `shouldUseOverviewFixture`; `getOverviewFixture({ greetingName, teamKey, sprintId })` |
| **Filter state** | URL: `team`, `sprint`, `fixture`. Client: `OverviewDashboardClient` `useState(ready)` for 2s showcase delay |
| **Key types** | `OverviewDashboardModel`, `OverviewSprintOption` (`src/lib/overview/types.ts`) |

### `/delivery-analysis`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/delivery-analysis/page.tsx` |
| **Mechanism** | **(a)/(org context)** server gate + **(c)** client snapshot |
| **Loaders / APIs** | Server: `getOrganizationContext`, Jira meta. Client: `DeliveryAnalysisDashboard` → `GET /api/delivery-analysis/snapshot` |
| **Hardcoded / fixture** | Empty states only; no dedicated delivery mock module |
| **Filter state** | URL: `from`, `projectKey` / `team`, `riskFocus`; client: `range`, `compare` |
| **Key types** | `DeliveryAnalysisFilters`, `DeliveryAnalysisSnapshot` |

### `/code-analysis`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/code-analysis/page.tsx` |
| **Mechanism** | **(a)/(b)** compliance + stored analysis + **(c)/(d)** client dashboard |
| **Loaders / APIs** | `getOrganizationContext`, `resolveStoredCodeAnalysis`, `loadComplianceFindings`; client → `GET /api/code-analysis/snapshot` |
| **Hardcoded / fixture** | Inline `fixtureAiPct(team)`; `getAvailableMockRepos()`; `preferMock` when fixture on |
| **Filter state** | URL: `fixture`, `team`. Client: repos, branch, range, author, trendMetric, source |
| **Key types** | `CodeAnalysisSnapshot`, `CodeAnalysisFilters`; `ComplianceFindingView` |

### `/qa`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/qa/page.tsx` |
| **Mechanism** | **(b)** named loaders + org context |
| **Loaders / APIs** | `loadLatestQaRun`, `buildQaPageView`, `getOrganizationContext` |
| **Hardcoded / fixture** | None for primary data |
| **Filter state** | URL: `from`. Client: QA evidence/filter chips |
| **Key types** | `LatestQaRunSummary`, `AgentPageView` |

### `/governance` (Compliance)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/governance/page.tsx` |
| **Mechanism** | **(a)** Prisma org + **(b)** org context / compliance loaders |
| **Loaders / APIs** | `getOrganizationContext`, `loadComplianceFindings`, `loadComplianceFindingSummary` |
| **Hardcoded / fixture** | Static copy strip; empty DNA message |
| **Filter state** | None |
| **Key types** | Delivery DNA; `ComplianceFindingView` |

### `/approvals`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/approvals/page.tsx` |
| **Mechanism** | **(d)** fixture branch **or** **(b)** via `getOrganizationContext` |
| **Loaders / APIs** | Live: `getOrganizationContext` + sort/summary helpers. Mutations: `POST /api/approvals` |
| **Hardcoded / fixture** | `OVERVIEW_APPROVALS_FIXTURE` (`src/lib/overview/approvals-fixture.ts`) |
| **Filter state** | URL: `fixture` |
| **Key types** | Approval + Recommendation shapes; `DecisionHistoryItem` |

### `/attention`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/attention/page.tsx` |
| **Mechanism** | **(d)/(e)** — always fixture-backed |
| **Loaders / APIs** | None live; `withOverviewContext` for hrefs |
| **Hardcoded / fixture** | `OVERVIEW_ATTENTION_FIXTURE` |
| **Filter state** | URL: `team`, `sprint`, `fixture` |
| **Key types** | `AttentionQueueItem` |

### `/observability`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/observability/page.tsx` |
| **Mechanism** | **(b)** org context + **(d)** mock dashboard when stub/no snapshot |
| **Loaders / APIs** | `getOrganizationContext`; `POST /api/integrations/prometheus/sync` |
| **Hardcoded / fixture** | `src/lib/observability-analysis/mock-data.ts` |
| **Filter state** | Client: source tab, serviceId, environment, range, compare, riskFocus |
| **Key types** | `ObservabilityAnalysisSnapshot`, `GrafanaOperationalSnapshot` |

### `/briefing` (Today)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/briefing/page.tsx` |
| **Mechanism** | **(b)** + automatic **(d)** mock if no trust states |
| **Loaders / APIs** | `loadBriefing`; `GET /api/drydock/suppressed`; `POST /api/drydock/rulings` |
| **Hardcoded / fixture** | `MOCK_BRIEFING` / `MOCK_LEDGER` in `src/lib/drydock/mock-data.ts` |
| **Filter state** | Client UI state for demoted/ruled lists |
| **Key types** | `MockBriefing`, `MockFinding`, `MockLedger` |

### `/ledger` (Tests)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/ledger/page.tsx` |
| **Mechanism** | **(b)** + automatic **(d)** mock if empty |
| **Loaders / APIs** | `loadLedger`; `GET /api/drydock/suppressed` |
| **Hardcoded / fixture** | `MOCK_LEDGER` when no trust states |
| **Filter state** | Client: selected `TrustDeficitReason`, suppressed panel |
| **Key types** | `MockLedger`, `MockTrustBucket`, `TrustDeficitReason` |

### `/standard` (Conventions)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/standard/page.tsx` |
| **Mechanism** | **(b)** Prisma via `loadStandard` |
| **Loaders / APIs** | `loadStandard`; `POST /api/drydock/standard` |
| **Hardcoded / fixture** | Heuristic pattern keys in `standard.ts` |
| **Filter state** | Client: rows, busy, error |
| **Key types** | `StandardView` |

### `/certificate` (Sign-off)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/certificate/page.tsx` |
| **Mechanism** | **(b)** Prisma aggregates |
| **Loaders / APIs** | `loadCertificate`; `POST /api/drydock/certificate` |
| **Hardcoded / fixture** | None |
| **Filter state** | Client form state |
| **Key types** | `CertificateView` |

### `/escapes` (Misses)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/escapes/page.tsx` |
| **Mechanism** | **(b)** `loadEscapes` → Prisma `Incident` |
| **Loaders / APIs** | `src/lib/drydock/escapes.ts` |
| **Hardcoded / fixture** | Empty-state copy only |
| **Filter state** | None |
| **Key types** | `EscapeView` |

### `/releases`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/releases/page.tsx` |
| **Mechanism** | **(a)** `prisma.release.findMany` |
| **Hardcoded / fixture** | None |
| **Filter state** | None |

### `/releases/new`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/releases/new/page.tsx` |
| **Mechanism** | Session-only shell; form → `POST /api/releases` |
| **Hardcoded / fixture** | Input placeholders only |

### `/releases/[id]`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/releases/[id]/page.tsx` |
| **Mechanism** | **(a)** Prisma + helpers |
| **Filter state** | Route param `id` |
| **Write paths** | assess/deploy APIs (unchanged by store migration) |

### `/integrations` (Connect)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/integrations/page.tsx` |
| **Mechanism** | **(a)/(b)** org context + **(c)** client panels |
| **Filter state** | URL OAuth/handoff params; panel-local `useState` |

### `/settings`

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/settings/page.tsx` |
| **Mechanism** | **(a)** Prisma org + users |
| **Hardcoded / fixture** | Static quick-link list |

### `/audit` (Decision log)

| Field | Detail |
|-------|--------|
| **Page** | `src/app/(platform)/audit/page.tsx` |
| **Mechanism** | **(b)** via `getOrganizationContext` |
| **Filter state** | Client: `AuditLogsPanel` category |

### `/reports` / `/risk`

| Field | Detail |
|-------|--------|
| **Mechanism** | **(e)** static placeholder |
| **Hardcoded / fixture** | Entire page is “not available” copy |

---

## 2. Platform shell

| File | Role / data |
|------|-------------|
| `src/app/(platform)/layout.tsx` | Session gate → `PlatformShell` |
| `src/components/layout/platform-shell.tsx` | Org name, `getOrganizationContext`, projects (fixture or Jira), last sync, fixture sprint chips; wraps `QueryProvider` |
| `src/components/layout/app-shell.tsx` | Client chrome; URL `team`; passes projects/sprints/sync |
| `src/components/layout/sidebar.tsx` | Org name, projects, lastSyncAt; writes `team` URL |
| `src/components/layout/top-bar.tsx` | User/role; sprint chip writes `sprint` URL |

**Hardcoded shell duplicates (fixture mode)** — historically desynced from `fixture.ts`:

- Org name: `"Connexus"`
- Projects: WEB / MOB / DATA / INFRA
- `lastSyncAt`: `"2026-08-24T10:49:00.000Z"`
- Sprints 36/37/38 labels + dates
- Active sprint label: `"Sprint 37 | Aug 10 – Aug 24"`

---

## 3. Mock / fixture modules

| Module | Purpose | Consumers |
|--------|---------|-----------|
| `src/lib/overview/fixture.ts` | Overview demo model | `/dashboard`, shell, gates, `/api/overview` |
| `src/lib/overview/approvals-fixture.ts` | Approvals + attention | `/approvals`, `/attention` |
| `src/lib/drydock/mock-data.ts` | Ledger + briefing | `loadLedger` / `loadBriefing` fallbacks |
| `src/lib/code-analysis/mock-data.ts` | Code analysis snapshot | Code page + API |
| `src/lib/observability-analysis/mock-data.ts` | Observability snapshot | Observability page |
| `src/lib/drydock/seed-pilot.ts` | Seeds pilot DB rows | `/api/drydock/seed-pilot` (not a page fixture) |

**Inline hardcoding:** `fixtureAiPct` in `code-analysis/page.tsx`; shell fixture duplicates; attention always fixture; `/reports`/`/risk` placeholders; `SHOWCASE_LOAD_MS = 2000` in overview client.

---

## 4. Sunset / redirect-only routes (no migration)

All re-export `src/lib/drydock/sunset-page.tsx` → `redirect("/dashboard")` except `/incidents*` → `/escapes`:

`/activate`, `/discovery`, `/delivery-dna`, `/devops`, `/productivity`, `/recommendations`, `/workflow`, `/code-health`, `/agent-threads`, `/agent-threads/new`, `/agent-threads/[id]`, `/governance/setup`, `/governance/policy`, `/governance/workflow`, `/governance/toolchain-mapping`, `/incidents`, `/incidents/[id]`.

---

## 5. Reusable types & loaders

- **Overview:** `OverviewDashboardModel` (`types.ts`); `loadOverviewDashboard` (`load-overview.ts`); `withOverviewContext` (`nav-context.ts`)
- **DryDock:** `loadLedger`, `loadBriefing`, `loadEscapes`, `loadCertificate`, `loadStandard`
- **Org:** `getOrganizationContext` (`org-data.ts`)
- **Compliance:** `loadComplianceFindings`, `loadComplianceFindingSummary`
- **QA:** `loadLatestQaRun`, `buildQaPageView`
- **Analysis resolve:** `resolveStoredJiraDelivery`, `resolveStoredCodeAnalysis`

---

## 6. QueryProvider usage

Mounted in `PlatformShell`; hooks in `src/lib/queries/threads.ts` only used by sunset agent-thread routes. Live surfaces use RSC props or ad-hoc `fetch`, not React Query.

---

## Quick matrix (live routes)

| Route | Primary mechanism | Fixture/mock risk |
|-------|-------------------|-------------------|
| `/dashboard` | (b)/(d) | Default fixture ON |
| `/delivery-analysis` | (c) | Low |
| `/code-analysis` | (c)/(d) | Fixture forces mock |
| `/qa` | (b) | Low |
| `/governance` | (a)/(b) | Low |
| `/approvals` | (b)/(d) | Default fixture ON |
| `/attention` | (d) always | Always fixture |
| `/observability` | (b)/(d) | Mock common |
| `/briefing` | (b)/(d) | Mock if empty |
| `/ledger` | (b)/(d) | Mock if empty |
| `/standard` | (b) | Heuristic mining |
| `/certificate` | (b) | Low |
| `/escapes` | (b) | Low |
| `/releases*` | (a)/(c) | Low |
| `/integrations` | (a)/(b)/(c) | Low |
| `/settings` | (a) | Low |
| `/audit` | (b) | Low |
| `/reports`, `/risk` | (e) | Placeholder |

---

## Target (post-migration)

All live display data flows through `src/lib/store/` (`AppData` + `useSyncExternalStore`). Mock authoring lives under `src/lib/store/mock/`. Live overlays under `src/lib/store/live/`. Write paths (approvals POST, release assess/deploy, integration OAuth) stay on real APIs.

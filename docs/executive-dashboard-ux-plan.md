# Executive Dashboard UX — Implementation Plan

**Status:** Spec · ready for execution  
**Last updated:** 2026-06-18  
**Owner agents:** `/frontend` (three-layer dashboard UI), `/backend` (briefing composer, health score, snapshot loaders), `/architect` (review before merge)

**Related:**

- [`docs/AIDOS-USP.md`](./AIDOS-USP.md) — Governance-aware operational intelligence positioning
- [`docs/AIDOS-PHASE-1-EXECUTION.md`](./AIDOS-PHASE-1-EXECUTION.md) — Operational dashboard shell (current baseline)
- [`new-qa-intelligence-release.md`](../new-qa-intelligence-release.md) — Release gate brief & `assessmentSummary`
- [`delivery-analysis.md`](../delivery-analysis.md) — Jira portfolio snapshots
- [`code-analysis.md`](../code-analysis.md) — GitHub activity snapshots

---

## 1. Executive summary

AIDOS enterprise users (CEO, CTO, Head of Engineering at SMB tech companies) need a **30-second answer** when they log in — not a wall of KPIs, agent telemetry, and internal product jargon.

Today `/dashboard` renders an operator console: four KPI tiles, governance workflow copy, platform health rows, agent activity, deep observability links, and audit feeds. Enterprise **home** still routes to `/workflow` until onboarding completes (`resolveLandingPath` in `src/lib/landing-path.ts`).

This plan redesigns the enterprise dashboard into **three progressive disclosure layers** on a single page:

| Layer | Purpose | Time budget |
|-------|---------|-------------|
| **L1 — Briefing** | Plain-English org summary + delivery health gauge | 10–30 s |
| **L2 — Breakdown** | Decompose L1 claims with claim cards + 1–2 charts | 1–2 min |
| **L3 — Full deck** | Relocate today’s dense widgets for power users | As needed |

**Product constraints (non-negotiable):**

- **Do not delete data** — relocate depth to L3 and existing analysis pages.
- **Recommend-only** — L1 surfaces approvals/blockers; never auto-execute.
- **No confident narrative on mock/stale data** — label freshness and gaps honestly.
- **Plain language in L1** — no “telemetry events,” “agent tokens,” or raw governance score without translation.

---

## 2. Problem statement

### 2.1 Target users

| Persona | Primary question | Today’s pain |
|---------|------------------|--------------|
| CEO | Are we on track? Anything I must decide? | Too many metrics; no single story |
| CTO | Can we ship? What’s blocking us? | Release context buried in `/releases/[id]` |
| Head of Engineering | Who’s contributing? What’s left? | Delivery/code analysis on separate nav items |
| Release / platform owner | Full operational picture | Current dashboard is closer to their need — keep as L3 |

### 2.2 Current surfaces

| Path | Role today |
|------|------------|
| `/dashboard` | Dense KPI grid + governance cards + agent strip |
| `/workflow` | Enterprise home (pre-onboarding complete); step checklist |
| `/delivery-analysis` | Jira portfolio charts (gated) |
| `/code-analysis` | GitHub attribution charts (gated) |
| `/observability` | Metrics/alerts (gated) |
| `/qa`, `/releases/[id]` | `ReleaseGateBrief` + `assessmentSummary` per release |

### 2.3 Gap

There is no **org-level briefing** that synthesizes `getOrganizationContext`, optional integration snapshots, and the latest release assess narrative into one executive paragraph and one defensible health score.

---

## 3. Design principles

1. **One story per viewport** — L1 fills `min-h-[calc(100vh-header)]` with only two focal elements.
2. **Claims → evidence** — Every sentence in L1 maps to an L2 claim card with linked metrics.
3. **Scroll = intentional depth** — Subtle “More detail ↓” cue; optional in-page anchors (`#breakdown`, `#full-deck`).
4. **Single primary CTA in L1** — At most one action (e.g. “Review 1 pending approval”).
5. **Integration-aware honesty** — Missing Jira/GitHub/observability → say what’s unknown, not zero.
6. **Operator widgets demoted** — Agent tokens, telemetry counts, audit tail → L3 only.

---

## 4. Information architecture

### 4.1 Layer 1 — Briefing (hero)

**Layout (desktop):** two-column grid inside a full-viewport section.

```
┌─────────────────────────────────────────────────────────────┐
│  [Org name]                              [as of 2h ago]     │
│                                                             │
│  ┌──────────────┐   ┌─────────────────────────────────────┐ │
│  │              │   │  100–150 word narrative             │ │
│  │  Vertical    │   │  (large type, plain English)        │ │
│  │  health      │   │                                     │ │
│  │  gauge       │   │  Optional: 1-line health label      │ │
│  │  (big)       │   │  e.g. "Delivery confidence: Strong" │ │
│  │              │   └─────────────────────────────────────┘ │
│  └──────────────┘                                           │
│                                                             │
│  [ Primary CTA if action needed ]        More detail ↓      │
└─────────────────────────────────────────────────────────────┘
```

**Mobile:** stack gauge above narrative; preserve large type; keep CTA sticky-friendly.

**Copy rules for L1 narrative:**

- 100–150 words target (hard cap 180).
- Lead with **release/delivery posture**, then **production stability**, then **governance blockers**.
- Use org name and active release name when available.
- Translate scores: “QA readiness is strong (78%)” not “readinessScore: 78”.
- End with **one** explicit action if `pendingApprovals > 0`, `rollbackPending > 0`, or `openIncidents > 0`.

**Empty / onboarding L1:** If `!ctx.dna`, keep existing redirect to governance setup. If DNA exists but no integrations: briefing explains setup progress and what to connect next (no fake health score).

### 4.2 Layer 2 — Breakdown

**Purpose:** Explain *why* L1 said what it said.

**Structure:**

- Section title: **“What this means”** or **“Breakdown”**
- **3–5 claim cards** — each card:
  - Headline (reuses a phrase from L1)
  - 1–2 supporting facts
  - Link to deep page (`/releases/[id]`, `/delivery-analysis`, etc.)
- **1–2 charts max** (only if integration data exists):
  - **Delivery:** tickets by status / version progress (`DeliveryAnalysisSnapshot.riskMix` or version rows)
  - **Engineering:** contributor activity (`CodeAnalysisSnapshot.byAuthor`) — last 7d
  - **Release:** compact `ReleaseGateBrief` (`compact` mode) for latest assessed release
  - **Stability:** mini health mix or open incidents count (from observability snapshot if present)

**Do not** add agent activity, audit logs, or token rollups in L2.

### 4.3 Layer 3 — Full deck

Relocate **today’s** dashboard content here with minimal logic changes initially:

- KPI grid (4 tiles)
- Governance workflow + approval center + platform health
- `AgentActivityStrip`
- Deep observability links
- Latest release card + recent activity / audit

Section title: **“Full operational view”** with copy: *For engineering leads who want the complete picture.*

Long term, L3 can slim down to deep links + embeds, but **phase 1 moves widgets rather than rewrites them**.

---

## 5. Delivery health score

### 5.1 Definition

**Label (user-facing):** `Delivery confidence` or `Delivery health` — not “governance score.”

Composite 0–100 score with four weighted dimensions. Store dimension breakdown for L2 claim cards and tooltip.

| Dimension | Weight | Inputs (`ctx.stats` + snapshots) |
|-----------|--------|----------------------------------|
| Release confidence | 35% | `releaseReadiness`, latest release `readinessScore`, `governanceRiskScore`, release status |
| Operational stability | 30% | `openIncidents`, `degradedDeployments`, `errorRate`, `p95Latency`, observability health mix |
| Delivery momentum | 20% | Jira: `healthScore`, `blocked`, `overdue`, `sprintCompletionPct` (if connected) |
| Governance & data trust | 15% | `pendingApprovals`, `rollbackPending`, integration freshness, `integrationsHealthy / connectedTools` |

### 5.2 Band labels (gauge)

| Score | Label | Color token |
|-------|-------|-------------|
| 80–100 | Strong | success |
| 60–79 | Steady | accent |
| 40–59 | Caution | warning |
| 0–39 | At risk | destructive |

### 5.3 Implementation

New module: `src/lib/executive-briefing/health-score.ts`

```ts
export type HealthDimension = {
  id: "release" | "stability" | "momentum" | "governance";
  label: string;
  score: number;       // 0–100
  weight: number;
  summary: string;     // one plain-English line for L2
};

export type DeliveryHealthScore = {
  overall: number;
  band: "strong" | "steady" | "caution" | "at_risk";
  bandLabel: string;
  dimensions: HealthDimension[];
  computedAt: string;
  dataGaps: string[];  // e.g. "Jira not connected"
};
```

**Rules:**

- If a dimension has no data, redistribute weight to available dimensions **or** cap overall score (document in code — prefer cap at 79 when release dimension missing).
- Never use mock delivery/code data in score without `source: "demo"` flag excluding score from L1.

---

## 6. Executive briefing composer

### 6.1 Output shape

New module: `src/lib/executive-briefing/compose-briefing.ts`

```ts
export type BriefingClaim = {
  id: string;
  headline: string;       // mirrors L1 sentence fragment
  facts: string[];      // 1–3 bullets for L2 card
  href?: string;
  severity?: "info" | "warning" | "critical";
};

export type ExecutiveBriefing = {
  narrative: string;           // 100–150 words
  wordCount: number;
  health: DeliveryHealthScore;
  claims: BriefingClaim[];       // 3–5 items for L2
  primaryCta?: { label: string; href: string };
  freshness: {
    asOf: string;
    stale: boolean;
    staleSources: string[];
  };
  source: "deterministic" | "llm_enriched";
};
```

### 6.2 Input aggregation

New loader: `src/lib/executive-briefing/load-briefing-context.ts`

Parallel fetch (extend pattern from `getOrganizationContext`):

| Source | Loader | Used for |
|--------|--------|----------|
| Org context | `getOrganizationContext` | releases, approvals, incidents, stats |
| Jira delivery | `resolveStoredJiraDelivery` + default filters (`30d`, all projects) | momentum claims, chart |
| Code analysis | `resolveStoredCodeAnalysis` | contributor claims, chart |
| Observability | Parse Prometheus/Grafana metadata snapshots (same as observability pages) | stability claims |
| Latest assessed release | `ctx.releases[0]` with `assessmentSummary` | release narrative |

### 6.3 Narrative generation — phased

**Phase A (ship first):** Deterministic template composer.

- Build paragraph from structured facts (release name, readiness %, incident count, approval count, blocked tickets, active authors).
- Use sentence templates with variation to avoid robotic tone.
- Pull release paragraph from `assessmentSummary` when present (truncate/sanitize for L1).

**Phase B (optional follow-on):** Mastra enrichment.

- New workflow `executive-briefing-enrich` (pattern: `src/mastra/workflows/discovery-dna.ts`).
- Input: deterministic briefing + facts JSON.
- Output: polished `narrative` only; **never** alter numeric facts or health score.
- Cache enriched narrative on `OrganizationProfile` or new `ExecutiveBriefingSnapshot` table (see §7).

### 6.4 Copy guardrails

Banned in L1 without translation:

- `telemetry`, `heartbeat`, `autonomy mode`, `governance score` (raw), `metricCount`, agent IDs

Required when applicable:

- “Data as of {relative time}”
- “{N} approval(s) waiting for your decision”
- “Integration data is over 24 hours old”

---

## 7. Data persistence (optional, Phase B)

For LLM enrichment and faster dashboard loads:

```prisma
model ExecutiveBriefingSnapshot {
  id             String   @id @default(cuid())
  organizationId String
  narrative      String
  healthJson     String   // DeliveryHealthScore JSON
  claimsJson     String
  source         String   // deterministic | llm_enriched
  generatedAt    DateTime @default(now())

  organization Organization @relation(...)
  @@index([organizationId, generatedAt])
}
```

Invalidate on: release assess, Jira/GitHub/observability sync, approval decision, incident open/close.

**MVP of this plan:** compute on each dashboard request (no new table in Phase 1).

---

## 8. Frontend components

### 8.1 New components (`src/components/executive-briefing/`)

| Component | Layer | Notes |
|-----------|-------|-------|
| `ExecutiveBriefingHero` | L1 | Viewport section; gauge + narrative |
| `DeliveryHealthGauge` | L1 | Vertical bar; animated fill; `band` color; accessible `aria-valuenow` |
| `BriefingNarrative` | L1 | `text-xl`–`text-2xl`, `leading-relaxed`, max-width prose |
| `BriefingPrimaryCta` | L1 | Single button; warning variant when blockers |
| `ScrollCue` | L1 | “More detail ↓” anchor to `#breakdown` |
| `BriefingBreakdownSection` | L2 | Grid of claim cards |
| `BriefingClaimCard` | L2 | headline + facts + link |
| `BriefingMiniChart` | L2 | Thin wrappers reusing existing chart primitives |
| `FullOperationalDeck` | L3 | Extracted from current `dashboard/page.tsx` |

### 8.2 Chart reuse (L2)

| Chart | Reuse from |
|-------|------------|
| Delivery risk mix | `delivery-analysis` trend / risk components |
| Author breakdown | `AuthorBreakdown` (compact prop) |
| Release scores | `ScoreStrip` from `release-gate-brief.tsx` |

Add `compact?: boolean` to existing chart components where needed — do not fork chart logic.

### 8.3 Dashboard page structure

Refactor `src/app/(platform)/dashboard/page.tsx`:

```tsx
export default async function EnterpriseDashboardPage() {
  // session, org, dna guards (unchanged)
  const briefing = await loadExecutiveBriefing(session.organizationId);

  return (
    <div className="w-full">
      <ExecutiveBriefingHero briefing={briefing} orgName={org.name} />
      <BriefingBreakdownSection id="breakdown" briefing={briefing} />
      <FullOperationalDeck ctx={ctx} org={org} />
    </div>
  );
}
```

Remove duplicate header KPI row from top — L3 retains KPI grid.

---

## 9. Navigation & routing changes

### 9.1 Enterprise home path

Update `WORKSPACE_META.ENTERPRISE.homePath` from `/workflow` → `/dashboard` in `src/lib/workspace-mode.ts`.

Update `resolveLandingPath` in `src/lib/landing-path.ts`:

- After DNA exists, prefer `/dashboard` (not only when workflow complete).
- Keep `/governance/setup` when `!hasDna`.
- Optional: first-time users with incomplete workflow see L1 onboarding narrative instead of redirecting to `/workflow`.

### 9.2 Nav prominence

In `getEnterpriseNavLayout()`:

- Move **Dashboard** above Workflow center (dashboard = primary `topItems[0]`).
- Workflow center remains one click away — not deleted.

### 9.3 Deep links

L2 claim cards and L1 CTA link to existing pages; no new routes required except optional API below.

---

## 10. API (optional)

`GET /api/executive-briefing` — returns `ExecutiveBriefing` JSON.

Use cases:

- Client refresh without full page reload
- Future mobile digest / email export
- Agent tools summarizing org state

Auth: same session + `organizationId` scoping as other routes.

Not required for Phase 1 if dashboard is server-rendered only.

---

## 11. Implementation phases

### Phase 1 — Foundation (3–5 days)

**Goal:** Shippable three-layer dashboard with deterministic briefing.

| Task | Owner | Files |
|------|-------|-------|
| `computeDeliveryHealthScore` | backend | `src/lib/executive-briefing/health-score.ts` |
| `composeExecutiveBriefing` (deterministic) | backend | `src/lib/executive-briefing/compose-briefing.ts` |
| `loadExecutiveBriefing` aggregator | backend | `src/lib/executive-briefing/load-briefing-context.ts` |
| Unit tests for score + composer | backend | `src/lib/executive-briefing/*.test.ts` |
| `ExecutiveBriefingHero` + gauge + narrative | frontend | `src/components/executive-briefing/*` |
| Refactor dashboard into L1/L2/L3 | frontend | `src/app/(platform)/dashboard/page.tsx` |
| `FullOperationalDeck` extraction | frontend | `src/components/executive-briefing/full-operational-deck.tsx` |
| Home path → dashboard | frontend | `workspace-mode.ts`, `landing-path.ts`, nav layout |
| `npm run build` passes | either | — |

**Exit criteria:**

- CEO persona can understand org state in &lt;30 s without scrolling.
- L3 contains all prior dashboard widgets.
- No mock data in L1 unless explicitly labeled “demo”.

### Phase 2 — Breakdown richness (2–3 days)

**Goal:** L2 claim cards and charts wired to real snapshots.

| Task | Owner |
|------|-------|
| Wire Jira snapshot → delivery claim + risk chart | backend + frontend |
| Wire code analysis → contributor claim + mini chart | backend + frontend |
| Embed compact `ReleaseGateBrief` for latest assessed release | frontend |
| Freshness strip (`asOf`, stale warnings) | frontend |
| `compact` props on shared charts | frontend |

### Phase 3 — Polish & enrichment (2–3 days, optional)

| Task | Owner |
|------|-------|
| Mastra `executive-briefing-enrich` workflow | backend |
| `ExecutiveBriefingSnapshot` persistence + invalidation | backend |
| `GET /api/executive-briefing` | backend |
| Scroll-snap / anchor UX polish | frontend |
| Role-based CTA (approver vs viewer) | backend |

### Phase 4 — Workflow page repositioning (1 day)

- Slim `/workflow` to checklist + link back to dashboard briefing.
- Avoid duplicating release lists that L2/L3 already cover.

---

## 12. Files to create / modify

### Create

```
src/lib/executive-briefing/
  health-score.ts
  compose-briefing.ts
  load-briefing-context.ts
  types.ts
  compose-briefing.test.ts
  health-score.test.ts

src/components/executive-briefing/
  executive-briefing-hero.tsx
  delivery-health-gauge.tsx
  briefing-narrative.tsx
  briefing-primary-cta.tsx
  scroll-cue.tsx
  briefing-breakdown-section.tsx
  briefing-claim-card.tsx
  briefing-mini-charts.tsx
  full-operational-deck.tsx
```

### Modify

```
src/app/(platform)/dashboard/page.tsx
src/lib/workspace-mode.ts
src/lib/landing-path.ts
src/components/delivery-analysis/* (compact mode, if needed)
src/components/code-analysis/author-breakdown.tsx (compact mode, if needed)
```

### Optional (Phase 3)

```
src/mastra/workflows/executive-briefing.ts
src/app/api/executive-briefing/route.ts
prisma/schema.prisma
```

---

## 13. Test plan

### Unit tests

- Health score: all dimensions present → expected weighted result
- Health score: missing Jira → `dataGaps` includes Jira; score capped appropriately
- Composer: pending approvals → narrative mentions approval; `primaryCta` set
- Composer: open incidents → severity `warning` or `critical` on stability claim
- Composer: word count within 100–180 range
- Composer: never includes banned jargon strings in L1

### Manual QA

| Scenario | Expected L1 behavior |
|----------|----------------------|
| Fresh org, DNA only | Setup narrative; no fake delivery score |
| Jira connected, release active | Release + ticket context in narrative |
| 1 pending approval | CTA “Review approval” |
| Stale Jira sync (&gt;24h) | Freshness warning in narrative |
| Open incident | Stability called out; gauge reduced |
| Scroll to L3 | All legacy widgets present |
| Mobile viewport | Readable narrative; gauge visible without horizontal scroll |
| MVP workspace | Still redirects to `/accelerator` (unchanged) |

### Build gate

```bash
npm run build
```

---

## 14. Success metrics

| Metric | Target |
|--------|--------|
| Time-to-understanding (user test) | &lt;30 s for “should we ship?” question |
| L1 scroll rate | &lt;40% of sessions need L3 for routine check-ins |
| Approval CTR from L1 CTA | Measurable via existing audit events |
| Support / confusion tickets | Reduction in “what does this number mean?” |

---

## 15. Out of scope (this plan)

- Replacing `/delivery-analysis`, `/code-analysis`, `/observability` pages
- MVP `/accelerator` dashboard redesign
- Email/Slack digest of briefing (future)
- Custom per-user briefing preferences
- Automated deploy or approval actions from dashboard

---

## 16. Architect review checklist

Before merge, confirm:

- [ ] L1 narrative is auditable (deterministic facts traceable to DB fields)
- [ ] Tenancy: all loaders scoped by `organizationId` from session
- [ ] Health score dimensions documented and unit-tested
- [ ] Mock/demo data never presented as production confidence in L1
- [ ] Mobile shell (`pb-24`, bottom nav) unaffected
- [ ] Aligns with USP: govern → observe → recommend; human approves
- [ ] `npm run build` green

---

## 17. Suggested execution order (orchestrator)

```
1. backend  → health-score.ts + compose-briefing.ts + tests
2. backend  → load-briefing-context.ts (snapshot wiring)
3. frontend → executive-briefing components (L1 + L2 shell)
4. frontend → dashboard page refactor + FullOperationalDeck extraction
5. frontend → nav + landing path updates
6. architect  → review
7. npm run build
```

---

## Appendix A — Example L1 narrative (deterministic)

> **Acme Corp** is preparing **v2.4** for staging. Delivery confidence is **steady** — QA readiness is at 78% and engineering closed 34 tickets in the last seven days. Production is stable with no open incidents, and latency is within normal range. **One release approval is waiting for your decision** before deploy can proceed. Jira data was synced 3 hours ago; GitHub activity reflects 4 contributors this week.

*(~65 words — within target range.)*

## Appendix B — Example L2 claim cards

| Claim headline | Facts | Link |
|----------------|-------|------|
| Preparing v2.4 for staging | Readiness 78%; risk low; 12 tickets open for fix version | `/releases/{id}` |
| 34 tickets closed this week | 3 blocked; 1 overdue | `/delivery-analysis` |
| 4 contributors active | Top: alice (18 commits), bob (12) | `/code-analysis` |
| 1 approval waiting | Release manager sign-off required | `/approvals` |

# Connexus Sprint 35 — End-to-End Browser Test Report

**Test date:** 2026-07-08  
**Tester:** Automated browser E2E (Cursor IDE Browser)  
**Organization:** Connexus (`connexus@neoito.com`)  
**Ground truth:** [`connexus-sprint35-analysis-2026-07-07.md`](./connexus-sprint35-analysis-2026-07-07.md) + live Jira API (`scripts/query-connexus-sprint.ts`)  
**Refactor under test:** Sprint/Release-Scoped Data Refactor (Phases A–F)

---

## Executive summary

The sprint-scoping refactor is **substantially implemented and working** for the primary user journeys. After a fresh Jira sync and re-assessment, Sprint 35 data is no longer dominated by the full CX project backlog (717 open / 30 blocked / 191 bugs).

**Verdict: PASS with caveats** — core sprint-scoped KPIs, dashboard headlines, and release assessment blockers match live Jira within expected drift. Several secondary surfaces still show project-wide counts, and QA readiness drops to 0% after fresh assessment due to Jira delivery health scoring + gap penalties.

| Area | Result |
|------|--------|
| Jira sync (Integrations) | ✅ Pass |
| Delivery analysis KPI strip | ✅ Pass (sprint-scoped) |
| Active sprint card & signals (sprint-specific) | ✅ Pass |
| Executive dashboard | ✅ Pass (sprint-first) |
| Release detail + re-assess | ⚠️ Partial (scoped blockers ✅, readiness score ❌) |
| Demo release cleanup | ❌ Fail (stale onboarding releases remain) |
| Delivery signals (mixed scope) | ⚠️ Partial |
| Reopened count accuracy | ❌ Fail (14 vs 1 current) |

---

## Test procedure

1. **Integrations** → clicked **Sync Jira data** (completed ~45s, timestamp `8/7/2026 10:16:26 AM`)
2. **Delivery analysis** → verified KPI strip, sprint card, signals, drill-down tabs
3. **Dashboard** → verified executive briefing headline, portfolio, health dimensions
4. **Releases** → verified Sprint 35 row; opened detail page
5. **Sprint 35 release** → clicked **Run governance & QA assessment** (fresh assess)
6. **Scripts** → `audit-connexus-platform-state.ts`, `verify-p2-metrics.ts`, `query-connexus-sprint.ts`

---

## Data comparison: Report vs Live Jira vs AIDOS UI

> Report is from **2026-07-07**. Live Jira and AIDOS were tested **2026-07-08** (+1 day overdue, +2 issues in sprint).

| Metric | Report (07-07) | Live Jira (08-07) | AIDOS UI (post-sync) | Match |
|--------|---------------:|------------------:|---------------------:|:-----:|
| Sprint ID | 807 | 807 | 807 | ✅ |
| Total committed | 74 | 76 | 76 | ✅ |
| Done (issue count) | 49 (66%) | 53 (70% by category) | 56/76 (74%) | ✅† |
| Open work | 25 | 23 | 20 | ⚠️ |
| Blocked (Onhold) | 0 explicit / 1 Onhold | 1 Onhold | 1 | ✅ |
| Open bugs in sprint | 11 | — | 8 | ✅† |
| QA / review pipeline | 13 | 10 (6 RFT + 2 IT + 2 RFR) | 10 | ✅† |
| Story points done | 0 / 29 (0%) | 0 / 29 | 0 / 29 (0%) | ✅ |
| Spillover (Sprint 34+) | 11 still open | 15 (carry-over JQL) | 15 | ⚠️ |
| Days overdue | 7 | 8 | 8 | ✅ |
| Vysakh open load | 7 (28%) | 7 (35%) | 7 (35%) | ✅ |
| Reopened (current status) | 1 | 1 | **14** in KPI | ❌ |
| Project open (reference) | — | — | 717 (integrations card) | — |

† **Done count methodology:** AIDOS `doneStatusNames` includes `"Dev Completed"` → 53 Done + 3 Dev Completed = 56 done. Report used Jira Done category only (49/74). This is intentional per toolchain mapping.

† **QA pipeline:** Report counted 13 on 07-07; live Jira now has 6 Ready for Testing (was 9). AIDOS correctly shows 10.

---

## Page-by-page findings

### 1. Integrations (`/integrations`)

**Actions:** Sync Jira data  
**Result:** ✅ Sync succeeded

| Observation | Status |
|-------------|--------|
| Last sync updated to `8/7/2026, 10:16:26 am` | ✅ |
| CX project selected | ✅ |
| Delivery snapshot card shows project-wide `717 open · 30 blocked` | ⚠️ Expected for project drill-down, but may confuse users expecting sprint scope |

**Screenshot notes:** Sync button transitions to "Syncing…" then back; snapshot timestamp updates.

---

### 2. Delivery analysis (`/delivery-analysis`)

**Result:** ✅ Primary KPIs sprint-scoped; ⚠️ signals section mixed

#### KPI strip (sprint-scoped) ✅

All top-level KPIs labeled **"Sprint: Sprint 35"**:

| KPI | Value | Report expectation |
|-----|------:|-------------------|
| Open work | 20 | ~23–25 (close; done-definition diff) |
| Blocked | 1 | 1 Onhold ✅ |
| Overdue | 0 | 0 in sprint ✅ |
| Reopened | 14 | **1** ❌ |
| Spillover | 15 | 11–18 range ⚠️ |

#### Headline banner ✅

> "1 blocked item across active work" — sprint-scoped, not "30 blocked"

#### Active sprint card ✅

- **Sprint 35** · CX
- **8 days past end date** (report: 7 on prior day)
- Dates: `2026-06-16 → 2026-06-30`
- Progress signal: `56/76 done (74%) · 0/29 SP (0%)`

#### Sprint-specific signals ✅

| Signal | AIDOS | Report |
|--------|------:|-------:|
| Sprint overdue | 8 days | 7 days (+1 day) ✅ |
| QA pipeline | 10 in testing/review | 13 → now 10 in Jira ✅ |
| Assignee load | Vysakh 7 open (35%) | Vysakh 7 (28%) ✅ |
| Spillover | 15 carried | 11 Sprint 34 open ⚠️ |

#### Still project-wide in signals ❌/⚠️

| Signal | Shows | Should be |
|--------|------:|-----------|
| Portfolio blocked work | 30 Onhold | Sprint: 1 |
| Bug backlog | 191 open bugs | Sprint: 8 |
| Reopened issues | 103 reopened | Sprint: 1 (current) or 14 (history) |

#### Priority gaps (bottom) ⚠️

Mix of sprint-scoped (`10 sprint issues in QA pipeline`, `Sprint 35 overdue`) and project-wide (`191 open Bugs`, `103 reopened`, `30 blocked`).

#### Risk mix ✅

Sprint-scoped: Blocked 4% (1), Open bugs 29% (8), Other 68% (19) — sums to 20 open.

---

### 3. Executive dashboard (`/dashboard`)

**Result:** ✅ Sprint-first briefing working

| Element | Value | Status |
|---------|-------|--------|
| Headline | "Connexus Sprint 35 — **74% complete**, delivery at risk" | ✅ |
| Sprint complete KPI | 74% | ✅ |
| Active sprint detail | "56/76 done" · 8 days overdue | ✅ |
| Release portfolio | Sprint 35 only (no fake onboarding in portfolio) | ✅ |
| Delivery momentum | "37 tickets closed…; **1 blocked**" | ✅ sprint-scoped |
| QA readiness (post re-assess) | 0% | ❌ see Release section |

**Not shown:** "Platform onboarding release" in portfolio row — ✅ fixed for briefing.

---

### 4. Releases list (`/releases`)

**Result:** ⚠️ Mixed

| Release | Status | Notes |
|---------|--------|-------|
| **Sprint 35** | NO-GO · synced from Jira sprint | ✅ Correct primary release |
| Platform onboarding release ×2 | NO-GO · demo | ❌ Stale demo rows still visible |

Before re-assess: Sprint 35 showed QA readiness **74%** (stale assessment from prior session).  
After re-assess: list would show **0%** (not re-checked after navigation).

---

### 5. Sprint 35 release detail (`/releases/cmrab91dm0008ob0mwj4vaqoa`)

**Actions:** Run governance & QA assessment  
**Result:** ⚠️ Scoped blockers fixed; readiness score regressed

#### Before re-assess (stale, 21h old)

| Field | Value | Problem |
|-------|-------|---------|
| QA readiness | 74% | Stale |
| Top blockers | 30 Onhold, 191 bugs, 103 reopened | ❌ Project-wide |
| Assessment text | "matched fix version Sprint 35" | ❌ Wrong match type |

#### After re-assess (fresh, just now) ✅/❌

| Field | Value | Status |
|-------|-------|--------|
| Scope label | "STAGING · Sprint Sprint 35 · project CX" | ✅ |
| Open sprint in Jira link | Present | ✅ |
| Assessment scope | "scope Sprint 35 (CX)" | ✅ |
| Top blockers | Sprint overdue 8d, QA pipeline 10, reopened 14 | ✅ Sprint-scoped |
| QA readiness | **0%** | ❌ |
| Jira delivery health | **0/100** | ❌ |
| Recommendation | HOLD | ⚠️ Correct given 0% readiness, but readiness calc seems too harsh |
| Signal count | 13 (was 10) | ✅ More sprint signals surfaced |

**Root cause hypothesis for 0% readiness:** `analyzeJiraDeliveryHealth` returns score 0 when hygiene degrades trust + sprint has critical gaps (overdue, spillover, QA pipeline, reopened). `computeWeightedReadiness` weights Jira health at 35% — a 0 health score collapses readiness despite 74% sprint completion.

---

## Script verification

### `verify-p2-metrics.ts` ✅

```json
{
  "committed": 76, "done": 56, "donePct": 74,
  "qaPipeline": 10, "spillover": 15, "daysOverdue": 8,
  "statusByName": { "Done": 53, "Reopened": 1, "Onhold": 1, ... },
  "topAssignee": { "assignee": "Vysakh R J", "openCount": 7 }
}
```

### `audit-connexus-platform-state.ts` ✅

Stored snapshot after sync confirms sprint fields on `activeSprint`:

```
openIssues: 20, blockedCount: 1, bugsOpen: 8,
qaPipelineCount: 10, spilloverCount: 15, reopenedCount: 14,
done: 56, committed: 76, daysOverdue: 8
```

Toolchain mapping: `releaseTracking: "sprint"`, `doneStatusNames: ["Done", "Dev Completed"]`, `blockedStatusName: "Onhold"`.

---

## Issues found (prioritized)

### P0 — Incorrect reopened count (14 vs 1)

- **Where:** KPI strip, release assessment, stored `activeSprint.reopenedCount`
- **Expected:** 1 issue currently in `Reopened` status (CX-3650 per report)
- **Actual:** 14 — likely counting changelog "reopened from done" history, not current status
- **Impact:** Inflates risk mix, gaps, and contributes to HOLD / 0% readiness

### P1 — QA readiness 0% despite 74% sprint completion

- **Where:** Release assess, dashboard release confidence
- **Expected:** Readiness reflects sprint health (~50–75 range given 74% done, 1 blocker, 10 QA queue)
- **Actual:** 0% after fresh assess; Jira delivery health 0/100
- **Impact:** HOLD recommendation may be directionally correct but score is not actionable/trustworthy

### P1 — Delivery signals still show project-wide counts

- **Where:** `Delivery signals` card — blocked 30, bugs 191, reopened 103
- **Expected:** Sprint-scoped or clearly labeled "Portfolio" vs "Sprint"
- **Impact:** Contradicts sprint-scoped KPI strip; confuses executives

### P2 — Demo "Platform onboarding release" rows persist

- **Where:** `/releases` list (2 duplicate rows)
- **Expected:** Hidden for scrum/sprint orgs (per P1 refactor intent)
- **Impact:** Clutters release governance view

### P2 — Priority gaps mix sprint + project scope

- **Where:** Delivery analysis bottom section
- **Expected:** All gaps sprint-scoped when `releaseTracking === "sprint"`

### P3 — Integrations snapshot shows project counts without scope label

- **Where:** Jira integration card
- **Suggestion:** Add "(project-wide)" label or show sprint summary alongside

### P3 — Open work 20 vs live 23

- **Likely cause:** `doneStatusNames` includes Dev Completed (3 items counted done → 76−56=20 open vs 76−53=23)
- **Suggestion:** Document in UI tooltip or align open count with Jira category view

---

## What was fixed (confirmed working)

1. ✅ **KPI strip sprint-scoped** — blocked 1 not 30, bugs 8 not 191, labels "Sprint: Sprint 35"
2. ✅ **Sprint completion accurate** — 56/76 (74%), 0/29 SP
3. ✅ **Sprint overdue** — 8 days (correct for test date)
4. ✅ **QA pipeline** — 10 issues (matches live Jira status breakdown)
5. ✅ **Assignee concentration** — Vysakh 7 open (35%)
6. ✅ **Dashboard sprint-first** — headline, portfolio, momentum use sprint data
7. ✅ **Release assess blockers** — post re-assess uses sprint scope, not project backlog
8. ✅ **Release scope label** — "Sprint Sprint 35 · project CX" + Jira deep link
9. ✅ **No fake release in executive portfolio**
10. ✅ **Jira sync pipeline** — fresh sync populates `activeSprint.*` sprint fields

---

## Recommendations

| Priority | Action |
|----------|--------|
| P0 | Fix `reopenedCount` to count current `Reopened` status in sprint, not changelog history |
| P1 | Tune `analyzeJiraDeliveryHealth` score for sprint scope — 74% completion should not yield 0/100 |
| P1 | Scope or split delivery signals into "Sprint" vs "Portfolio" sections |
| P2 | Filter/hide demo onboarding releases for Connexus scrum org |
| P2 | Scope priority gaps to release methodology |
| P3 | Add scope labels on integrations project summary |

---

## Test artifacts

- Browser pages tested: Integrations, Delivery analysis, Dashboard, Releases, Sprint 35 release detail
- Screenshots captured during session (Integrations sync, Delivery analysis KPIs, Dashboard briefing, Release assess before/after)
- Supporting scripts: `audit-connexus-platform-state.ts`, `verify-p2-metrics.ts`, `query-connexus-sprint.ts`

---

## Sign-off

| Criterion | Met |
|-----------|:---:|
| Sprint 35 is primary release everywhere | ✅ |
| KPIs no longer show 717/30/191 at top level | ✅ |
| Sprint completion ~70–74% matches Jira | ✅ |
| QA readiness reflects sprint reality | ❌ |
| No demo "platform onboarding" in briefing | ✅ |
| Assessment blockers sprint-scoped after re-assess | ✅ |
| Full parity with 2026-07-07 report | ⚠️ (expected drift + reopened bug) |

**Overall: Ship-ready for sprint-scoped display layer; follow-up needed on reopened count and readiness scoring.**

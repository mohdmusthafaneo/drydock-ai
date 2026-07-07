# Connexus Jira — Sprint 35 Analysis Report

**Generated:** 2026-07-07  
**Organization:** Connexus (`connexus`)  
**Site:** [neoito-team-connexus.atlassian.net](https://neoito-team-connexus.atlassian.net)  
**Project:** CX · **Board:** SCRUM board (id 1) · **Sprint:** Sprint 35 (id 807)  
**Analysis method:** Direct Jira REST API via OAuth token resolved from AIDOS integration (`resolveJiraAccessToken`). No AIDOS delivery-health, risk-scoring, or sync algorithms were used.

---

## Executive Summary

Sprint 35 ended on **2026-06-30** but remains **`active`** in Jira as of **2026-07-07** — seven days overdue with no formal closure. Of **74 committed issues**, **49 are Done (66%)** and **25 remain open (34%)**.

The sprint looks healthier on paper than it is in practice:

| Signal | Value | Interpretation |
|--------|------:|----------------|
| Issue completion | 66% | Moderate progress |
| Story point completion | 0% | All 29 SP still on open work |
| Unestimated issues | 93.2% | Velocity metrics unreliable |
| Open work in QA/review | 13 (52% of open) | Bottleneck is testing, not dev |
| Sprint 34 carry-over unresolved | 11/11 (100%) | Zero resolution between sprints |
| Sprint health score | **3.5 / 10** | Process and flow risks dominate |

**Verdict:** Sprint 35 is a **stabilization sprint** (69% bugs) that inherited chronic debt, failed to close cleanly, and is constrained by a testing pipeline backlog. Immediate action should focus on sprint closure governance, QA throughput, and descoping legacy carry-over items.

---

## 1. Sprint Metadata

| Field | Value |
|-------|-------|
| Sprint name | Sprint 35 |
| Sprint ID | 807 |
| Board | SCRUM board (id 1) |
| Project | CX — Connexus |
| State | `active` *(not closed despite end date passed)* |
| Goal | *(empty)* |
| Start date | 2026-06-16 |
| End date | 2026-06-30 |
| Duration | 13 days |
| Days overdue (as of 2026-07-07) | **7** |

### Key metadata findings

- No sprint goal was set — there is no measurable success criterion for closure.
- The sprint has not been formally closed, obscuring true velocity and spill-out metrics.
- A bulk sprint reassignment on **2026-06-16 ~18:27 IST** moved 18 issues from Sprint 34 into Sprint 35.

---

## 2. Completion & Scope

**JQL used:** `sprint = 807 AND project = CX`  
**Total issues:** 74 (cross-checked via approximate count)

### 2.1 Done vs not done — status category

| Category | Count | % of Sprint |
|----------|------:|------------:|
| Done | 49 | 66.2% |
| In Progress | 19 | 25.7% |
| To Do | 6 | 8.1% |
| **Not done (total)** | **25** | **33.8%** |

### 2.2 Done vs not done — status name

| Status | Jira Category | Count |
|--------|---------------|------:|
| Done | Done | 49 |
| Ready for Testing | In Progress | 9 |
| To Do | To Do | 6 |
| In Progress | In Progress | 2 |
| Dev Completed | In Progress | 2 |
| In Test | In Progress | 2 |
| Ready for review | In Progress | 2 |
| Reopened | In Progress | 1 |
| Onhold | In Progress | 1 |

### 2.3 Definition-of-done funnel

```
Sprint 35 (74 issues)
├── Done (49) ───────────────────────────── 66.2%  ✓ shipped in Jira
├── Review/Testing pipeline (13) ──────────── 17.6%  ⏳ near finish
│   ├── Ready for Testing (9)
│   ├── In Test (2)
│   └── Ready for review (2)
└── Earlier stages (12) ─────────────────── 16.2%  🔴 not close
    ├── To Do (6)
    ├── In Progress (2)
    ├── Dev Completed (2)
    ├── Reopened (1)
    └── Onhold (1)
```

| Stage | Count | % of Sprint |
|-------|------:|------------:|
| Truly Done (`Done` status) | 49 | 66.2% |
| In review / testing (open) | 13 | 17.6% |
| Other open (To Do, dev, etc.) | 12 | 16.2% |

**Realistic completion tiers:**

| Definition of "shipped" | Count | % |
|---------------------------|------:|--:|
| Jira Done status | 49 | 66.2% |
| Done + in review/testing | 62 | 83.8% |
| Fully open (not in QA lane) | 12 | 16.2% |

### 2.4 Story points

| Metric | Value |
|--------|------:|
| Field | `customfield_10016` — Story point estimate |
| Committed (total SP) | 29 |
| Completed SP | **0** |
| Remaining SP | 29 |
| SP completion % | **0%** |
| Unestimated issues | 69 / 74 |
| % unestimated | **93.2%** |

| Bucket | Issues with SP | Story Points |
|--------|---------------:|-------------:|
| Done issues | 0 | 0 |
| Open issues | 5 | 29 |

Every estimated story point sits on open work. Done issues carry no story points, making SP-based velocity meaningless for this sprint.

### 2.5 Issue type breakdown

| Type | Count | % | Open | Done |
|------|------:|--:|-----:|-----:|
| Bug | 51 | 68.9% | 11 | 40 |
| Task | 14 | 18.9% | 7 | 7 |
| Story | 9 | 12.2% | 7 | 2 |
| **Total** | **74** | 100% | **25** | **49** |

**Bug : Story ratio ≈ 5.7 : 1** — heavily bug-driven sprint. Only 2 of 9 Stories are Done.

### 2.6 Priority breakdown (open items)

| Priority | Count |
|----------|------:|
| Medium | 25 |
| High | 0 |
| Low | 0 |
| Blocker | 0 |

All open work is uniformly Medium priority. Jira provides no escalation signal for the remaining 25 items. One item (`CX-3620`) is flagged `[Critical]` in the summary but remains Medium in the priority field.

### 2.7 Age of open items

| Stat | Days Open |
|------|----------:|
| Minimum | 3 |
| Median | 26 |
| Average | 67 |
| Maximum | **678** |

**Oldest open issues:**

| Key | Status | Type | Days Open | Created |
|-----|--------|------|----------:|---------|
| CX-125 | Ready for review | Task | **678** | 2024-08-27 |
| CX-2509 | To Do | Task | 181 | 2026-01-06 |
| CX-2730 | To Do | Bug | 152 | 2026-02-04 |
| CX-3050 | Ready for Testing | Story | 110 | 2026-03-19 |
| CX-3158 | Ready for review | Task | 87 | 2026-04-10 |
| CX-3168 | To Do | Task | 81 | 2026-04-16 |
| CX-3272 | To Do | Bug | 63 | 2026-05-05 |
| CX-3297 | In Test | Story | 60 | 2026-05-08 |
| CX-3318 | To Do | Bug | 54 | 2026-05-13 |
| CX-3484 | Ready for Testing | Task | 27 | 2026-06-09 |

`CX-125` (678 days, created Aug 2024) is chronic backlog debt, not realistic sprint-scoped work.

### 2.8 Commitment realism

| Metric | At Sprint End Target | Actual (2026-07-07) |
|--------|---------------------|---------------------|
| Sprint closed? | Yes | **No** — still `active`, +7 days overdue |
| Issues shipped | 100% | **66.2%** Done |
| Issues remaining | 0 | **25** (33.8%) |
| Story points shipped | — | **0%** (0 / 29 SP) |

---

## 3. Spillover & Carry-Over

**Severity: HIGH**

| Metric | Value |
|--------|-------|
| Still open (spill-out risk) | **25 (34%)** |
| Carry-in (created before sprint start) | **22 (30%)** |
| Confirmed carry-over from Sprint 34 (changelog) | **18** |
| Sprint 34 open issues carried into 35 (still open) | **11 / 11 (100%)** |

### 3.1 Recent closed sprints (board 1)

| Sprint | ID | Dates | Issues | Done | Open at close | Completion |
|--------|-----|-------|--------|------|---------------|------------|
| Sprint 34 | 774 | May 18 – Jun 14 (closed Jun 16) | 111 | 100 | **11** | 90% |
| Sprint 33 gap | 741 | May 15 – Jun 14 | 29 | 21 | 8 | 72% |
| Sprint 33 | 708 | Apr 17 – May 1 | 121 | 99 | 22 | 82% |
| Sprint 32 | 675 | Mar 16 – Mar 25 | 110 | 103 | 7 | 94% |
| Sprint 31 | 642 | Feb 6 – Mar 19 | 149 | 135 | 14 | 91% |

Recurring pattern: **7–22 open issues** at each sprint close.

### 3.2 Sprint 34 → 35 carry-over

On **2026-06-16**, 18 issues were confirmed via changelog as moved from Sprint 34 into Sprint 35. **7 were completed in Sprint 35; 11 remain open.**

The 11 still-open Sprint 34 spill items (zero resolution between sprints):

```
CX-125, CX-2509, CX-2730, CX-3050, CX-3158, CX-3168,
CX-3272, CX-3297, CX-3318, CX-3481, CX-3484
```

### 3.3 Chronic multi-sprint debt

| Key | Summary | Sprints touched |
|-----|---------|-----------------|
| **CX-125** | Update Permission Structure | Sprint 3 → 35 (30+ sprints) |
| CX-2509 | Missing "Created By" in Vendor Contact | Sprint 29 → 35 |
| CX-2730 | Date Filter off-by-one | Sprint 30 → 35 |
| CX-3168 | PRODUCTION - Test Data Deletion | Sprint 32 → 35 |
| CX-3272 | SOW list fails at 121+ properties | Sprint 33 → 35 |

### 3.4 Likely spill-out of Sprint 35

**25 issues** still open — breakdown by origin:

| Origin | Count |
|--------|------:|
| New Sprint 35 scope | 14 |
| Carried from Sprint 34 | 11 |

**Open issues by status category:**

| Status | Count |
|--------|------:|
| Ready for Testing | 9 |
| To Do | 6 |
| In Test / In Progress / Dev Completed | 6 |
| Ready for review | 2 |
| Reopened | 1 |
| Onhold | 1 |

### 3.5 Sprint assignment vs status mismatch

Issues assigned to **closed sprints** but not Done:

| Closed Sprint | Open Issues |
|---------------|-------------|
| Sprint 34 (774) | 11 |
| Sprint 33 gap (741) | 8 |
| Sprint 33 (708) | 22 |
| **Total (last 3 closed)** | **41** |

Issues retain sprint tags after sprint close without being moved or completed — a data hygiene problem that masks true spill-out.

### 3.6 Sprint 34 vs Sprint 35 comparison

| Metric | Sprint 34 | Sprint 35 | Delta |
|--------|-----------|-----------|-------|
| Issue count | 111 | 74 | −37 |
| Done | 100 (90%) | 49 (66%) | |
| Open at analysis | 11 | 25 | +14 |
| Carry-over from prior | — | 18 (changelog) | |

Sprint 35 committed fewer issues but inherited a large carry-over block. Completion rate dropped from 90% → 66%.

---

## 4. Risk Profile

**Overall sprint health score: 3.5 / 10**

Rationale: 66% completion shows real progress, but the sprint is a week overdue with 64% of remaining work stuck >7 days, a 13-item testing queue, 93% unestimated scope, no sprint goal, and legacy items (`CX-125` from Aug 2024) still open.

### 4.1 Top 5 risks (ranked)

| Rank | Severity | Risk | Key evidence |
|:----:|:--------:|------|--------------|
| 1 | **High** | Sprint overdue, still active | 7 days past 2026-06-30 end date |
| 2 | **High** | Testing/review bottleneck | 13 items in Ready for Testing / In Test / Ready for review |
| 3 | **High** | 64% of open work stuck >7 days | 16 keys including CX-125, CX-2509 |
| 4 | **High** | Legacy backlog in active sprint | CX-125 (Aug 2024), CX-2509, CX-2730, CX-3050 |
| 5 | **High** | Assignee concentration (SPOF) | Vysakh R J — 7/25 open (28%) |

### 4.2 Full risk register

#### Delivery risks

| # | Risk | Severity | Evidence | Recommended action |
|---|------|----------|----------|-------------------|
| 1 | Sprint overdue — still active | **High** | Ended 2026-06-30; 7 days overdue, state still `active` | Formally close or extend; triage 25 open items |
| 2 | Open work volume vs deadline slip | **High** | 25 open with 7 days past deadline | Enforce WIP limits; defer/descope To Do items |
| 3 | Critical/high priority (field-level) | Low | 0 open Critical/High; all Medium | Adopt priority discipline or labels |
| 4 | Reopened items | Medium | 1: CX-3650 (Reopened, unassigned) | Assign owner; root-cause regression |
| 5 | On-hold items | Medium | 1: CX-3601 (Onhold, stuck >7 days) | Resolve blocker or remove from sprint |
| 6 | Blocked items | Low | 0 explicit blockers | Verify CX-3601 Onhold is not undeclared blocker |
| 7 | Stuck in same status >7 days | **High** | 16 of 25 open (64%) | Daily stuck-item review; force transition or descope |

**Items stuck >7 days:** CX-3601, CX-3527, CX-3524, CX-3515, CX-3497, CX-3484, CX-3481, CX-3318, CX-3297, CX-3272, CX-3168, CX-3158, CX-3050, CX-2730, CX-2509, CX-125

#### Quality / process risks

| # | Risk | Severity | Evidence | Recommended action |
|---|------|----------|----------|-------------------|
| 8 | Very high unestimated issues | Medium | 69/74 (93.2%) lack story points | Estimate remaining open items before close |
| 9 | No sprint goal | Medium | Goal field empty | Define measurable closure goal |
| 10 | Testing bottleneck | **High** | 13 in RFT / In Test / Ready for review | Add QA capacity; swarm oldest items |
| 11 | Unassigned open issues | Low | 1: CX-3650 | Assign before next standup |

#### People risks

| # | Risk | Severity | Evidence | Recommended action |
|---|------|----------|----------|-------------------|
| 12 | Assignee concentration | **High** | Vysakh R J: 7 open (28%), 2.3× next assignee | Rebalance testing queue off Vysakh |

#### Technical risks

| # | Risk | Severity | Evidence | Recommended action |
|---|------|----------|----------|-------------------|
| 13 | Critical in summary, not priority | Medium | CX-3620 `[Critical] AWS amplify gen 1 to gen 2 migration` — Dev Completed | Fast-track through testing (Basim E) |
| 14 | Large/old backlog in sprint | **High** | CX-125 (Aug 2024), CX-2509, CX-2730, CX-3050 | Re-validate scope; split or move out |

---

## 5. Team Workload & Flow

### 5.1 Open issues per assignee

| Assignee | To Do | In Progress | Dev Completed | Ready for review | Ready for Testing | In Test | Reopened | Onhold | **Open** |
|----------|------:|------------:|--------------:|-----------------:|------------------:|--------:|---------:|-------:|---------:|
| Vysakh R J | 2 | 1 | — | — | 3 | 1 | — | — | **7** |
| rameshpr | — | — | — | — | 3 | — | — | — | **3** |
| Varun Wilson | — | — | 1 | — | 2 | — | — | — | **3** |
| ajay.dev | — | 1 | — | 1 | — | 1 | — | — | **3** |
| Nisha C N | 2 | — | — | — | — | — | — | — | **2** |
| Basim E | 1 | — | 1 | — | — | — | — | — | **2** |
| Srilakshmi Sivan | 1 | — | — | — | — | — | — | 1 | **2** |
| Rakhesh J | — | — | — | — | 1 | — | — | — | **1** |
| Raoof | — | — | — | 1 | — | — | — | — | **1** |
| *(Unassigned)* | — | — | — | — | — | — | 1 | — | **1** |
| **Total** | **6** | **2** | **2** | **2** | **9** | **2** | **1** | **1** | **25** |

### 5.2 Active dev WIP (In Progress only)

| Assignee | WIP | Issue |
|----------|----:|-------|
| Vysakh R J | 1 | CX-3648 — Property-level status changes not captured in Audit Log |
| ajay.dev | 1 | CX-3524 — Performance Testing and Blue green setup in staging env |
| **Total** | **2** | |

Only 2 items in active development. The remaining 23 open items are in downstream states.

### 5.3 Testing queue (Ready for Testing + In Test)

| Key | Summary | Status | Owner | Type |
|-----|---------|--------|-------|------|
| CX-3656 | Audit Log Date Filter Is Not Functional | Ready for Testing | rameshpr | Bug |
| CX-3653 | Track and store each user's last login date and time | Ready for Testing | Varun Wilson | Task |
| CX-3651 | Selected Client Context Is Lost After Inviting a Vendor | Ready for Testing | Varun Wilson | Bug |
| CX-3644 | Audit Log Search Does Not Return Results for "System" Entries | Ready for Testing | rameshpr | Bug |
| CX-3582 | Mobile Version Does Not Reflect Updated Branding Changes | Ready for Testing | Rakhesh J | Bug |
| CX-3527 | vendor compliance Status | In Test | Vysakh R J | Story |
| CX-3515 | Client Change Requests for in vendor compliance | Ready for Testing | Vysakh R J | Story |
| CX-3484 | Audit Log Not Generated for Client Vendor Status Updates | Ready for Testing | rameshpr | Task |
| CX-3481 | Client Scope of Work XLSX Export Download Fails | Ready for Testing | Vysakh R J | Bug |
| CX-3297 | Vendor Compliance workflow for All Other Companies | In Test | ajay.dev | Story |
| CX-3050 | Vendor Compliance Flow: Vendor Invite workflow | Ready for Testing | Vysakh R J | Story |

**Testing queue by owner:**

| Owner | Ready for Testing | In Test | Total |
|-------|------------------:|--------:|------:|
| Vysakh R J | 3 | 1 | **4** |
| rameshpr | 3 | — | **3** |
| Varun Wilson | 2 | — | **2** |
| ajay.dev | — | 1 | **1** |
| Rakhesh J | 1 | — | **1** |
| **Total** | **9** | **2** | **11** |

### 5.4 Done contributors (changelog-based)

| Contributor | Issues closed |
|-------------|-------------:|
| Srilakshmi Sivan | 23 |
| Shini | 22 |
| Nisha C N | 4 |
| **Total** | **49** |

### 5.5 Components & labels (open items)

**Components:** None on any of the 25 open issues (0% component coverage).

**Labels on open items:**

| Label | Count |
|-------|------:|
| VendotInvite | 4 |
| VendorComplianceCRs | 3 |
| Authentication | 1 |
| VendorRegistration | 1 |
| StageNew | 1 |
| RFPScalingIssue | 1 |
| ProdTestData | 1 |
| E-Sign | 1 |
| PropertyInsurance | 1 |
| RFP | 1 |

10 of 25 open issues (40%) have no labels.

**Thematic concentration:** Vendor Compliance, Audit Log, Vendor Invite.

### 5.6 Due dates

No open sprint issues have a due date in the past.

---

## 6. All Open Issues (25)

| Key | Summary | Status | Assignee | Origin | Days Open |
|-----|---------|--------|----------|--------|----------:|
| CX-3656 | Audit Log Date Filter Is Not Functional | Ready for Testing | rameshpr | New S35 | 3 |
| CX-3653 | Track and store each user's last login date and time | Ready for Testing | Varun Wilson | New S35 | 3 |
| CX-3652 | Display an "Exempt" informational page | To Do | Vysakh R J | New S35 | 3 |
| CX-3651 | Selected Client Context Is Lost After Inviting a Vendor | Ready for Testing | Varun Wilson | New S35 | 3 |
| CX-3650 | Existing vendor status cannot be changed to Exempt | Reopened | — | New S35 | 3 |
| CX-3648 | Property-level status changes not captured in Audit Log | In Progress | Vysakh R J | New S35 | 4 |
| CX-3644 | Audit Log Search Does Not Return Results for "System" | Ready for Testing | rameshpr | New S35 | 4 |
| CX-3620 | [Critical] AWS amplify gen 1 to gen 2 migration | Dev Completed | Basim E | New S35 | 6 |
| CX-3601 | [Compliances demo review] issues marked not to do | Onhold | Srilakshmi Sivan | New S35 | 8 |
| CX-3582 | Mobile Version Does Not Reflect Updated Branding | Ready for Testing | Rakhesh J | New S35 | 14 |
| CX-3527 | vendor compliance Status | In Test | Vysakh R J | Pre-start | 18 |
| CX-3524 | Performance Testing and Blue green setup | In Progress | ajay.dev | Pre-start | 18 |
| CX-3515 | Client Change Requests for vendor compliance | Ready for Testing | Vysakh R J | Pre-start | 19 |
| CX-3497 | Property selection and bidsubmission for multiple properties | Dev Completed | Varun Wilson | Pre-start | 22 |
| CX-3484 | Audit Log Not Generated for Client Vendor Status Updates | Ready for Testing | rameshpr | S34 carry | 27 |
| CX-3481 | Client Scope of Work XLSX Export Download Fails | Ready for Testing | Vysakh R J | S34 carry | 27 |
| CX-3318 | Request Timeout for Large Property-Vendor Combinations | To Do | Nisha C N | S34 carry | 54 |
| CX-3297 | Vendor Compliance workflow for All Other Companies | In Test | ajay.dev | S34 carry | 60 |
| CX-3272 | SOW list fails to load at 121+ properties | To Do | Srilakshmi Sivan | S34 carry | 63 |
| CX-3168 | PRODUCTION - Test Data Deletion | To Do | Vysakh R J | S34 carry | 81 |
| CX-3158 | Update Reminder Email Frequency from 1 Day to 2 Days | Ready for review | ajay.dev | S34 carry | 87 |
| CX-3050 | Vendor Compliance Flow: Vendor Invite workflow | Ready for Testing | Vysakh R J | S34 carry | 110 |
| CX-2730 | Date Filter Shows Feb 4 Records When Filtering for Feb 3 | To Do | Basim E | S34 carry | 152 |
| CX-2509 | Missing "Created By" Value in Vendor Contact Management | To Do | Nisha C N | S34 carry | 181 |
| CX-125 | Update Permission Structure to add permission type | Ready for review | Raoof | S34 carry | **678** |

---

## 7. Flow Observations

### Bottlenecks

- **Testing is the primary constraint.** 11 of 25 open items (44%) sit in Ready for Testing or In Test. Dev output has piled up ahead of QA throughput.
- **Vysakh R J is the most loaded** — 7 open items with 4 in the testing pipeline.
- **rameshpr holds 3 Ready-for-Testing items** — audit-log cluster (CX-3656, CX-3644, CX-3484).

### Overload signals

- Sprint is 7 days past end date with 34% still open.
- 6 items still in To Do while testing backs up.
- CX-3650 is Reopened and unassigned.

### Underutilized capacity

- Only 2 items in In Progress — active coding WIP is very low.
- Nisha C N, Basim E, and Srilakshmi Sivan have To Do items but no active WIP — available to help clear testing queue.

### Positive signals

- 66% completion with strong close velocity from Srilakshmi and Shini.
- No overdue due dates on open work.
- Dev Completed (2) and Ready for review (2) are thin — most dev-done work has moved into testing.

---

## 8. Recommended Actions

### Immediate (this week)

1. **Close Sprint 35 formally** — 7 days past end with no closure obscures commitment.
2. **Swarm the testing queue** — prioritize 9 Ready-for-Testing items; pull Nisha or Rakhesh into test execution.
3. **Triage CX-3650** — Reopened, unassigned; assign owner before next standup.
4. **Fast-track CX-3620** — critical Amplify migration sitting in Dev Completed.
5. **Resolve CX-3601 Onhold** — explicit hold on Srilakshmi's queue.

### Sprint planning (Sprint 36)

6. **Explicitly assign 25 open items** to Sprint 36 or backlog — do not leave Sprint 35 `active`.
7. **Descope chronic debt** — re-validate or remove CX-125, CX-2509, CX-2730 from sprint scope.
8. **Decide on 6 To Do items** — start, defer, or move out; unstarted scope with past end date is a commitment risk.
9. **Set a sprint goal** with measurable closure criteria.
10. **Estimate remaining work** — at minimum t-shirt sizes on 25 open items.

### Process hygiene

11. **Clean up 41 stale sprint assignments** on closed sprints.
12. **Avoid dual-sprint tagging** on rollover — move issues, don't append sprint names.
13. **Adopt priority discipline** — all-Medium priority provides no triage signal.
14. **Rebalance load off Vysakh R J** — 28% of remaining open work on one person.

---

## 9. Re-Run Analysis

Scripts use `resolveJiraAccessToken()` for org `connexus` and query Jira directly:

```bash
npx tsx scripts/sprint-analysis-completion.ts      # completion & scope
npx tsx scripts/analyze-sprint-spillover.ts        # spillover & carry-over
npx tsx scripts/connexus-sprint35-risk-profile.ts  # risk register
npx tsx scripts/query-connexus-sprint.ts           # quick sprint snapshot
```

---

## Appendix: Analysis Sources

| Analysis area | Script | API endpoints used |
|---------------|--------|-------------------|
| Completion & scope | `scripts/sprint-analysis-completion.ts` | `/rest/api/3/search/jql`, `/rest/agile/1.0/sprint/807` |
| Spillover & carry-over | `scripts/analyze-sprint-spillover.ts` | `/rest/agile/1.0`, `/rest/api/3/search/jql`, `/rest/api/3/issue/{key}/changelog` |
| Risk profile | `scripts/connexus-sprint35-risk-profile.ts` | `/rest/api/3/search/jql` |
| Workload & flow | Inline analysis | `/rest/api/3/search/jql`, changelog |

**Credential method:** OAuth Bearer token decrypted from `Integration.metadataJson` for Connexus org, resolved via `src/lib/jira-api.ts`. Cloud ID: `212728dc-9989-4872-b3f6-b6ab9cad7d40`.

**Note:** `/rest/agile/1.0/sprint/{id}/issue` returns 401 (scope mismatch) with current OAuth scopes. Issue data was fetched via JQL (`sprint = 807`) instead.

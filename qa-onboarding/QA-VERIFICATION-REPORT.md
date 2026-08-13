# QA Verification Report — Connexus at live.neoitotech.in
**Date:** 2026-08-13
**Account:** connexus@neoito.com / Password@123
**Scope:** All 85 tickets in `TICKETS.csv`
**Result:** 28 QA Verified · 57 QA Failed · 0 blocked

Companion CSV: `qa-onboarding/TICKETS.csv` — columns `status` and `status_reason` added.

---

## How to read this report
Every ticket now carries `status` (`QA Verified` or `QA Failed`) and a `status_reason`. Verified means the live app behaves correctly against the ticket scope. Failed means the live app still exhibits the bug, still has the dead code, or still lacks the documented behavior.

QA did **not** verify non-observable concerns (e.g. token-rotation policies, future-routing roadmap, doc refreshes not shipped) by clicking alone. Those carry `QA Failed` if no artifact was findable in the app or repo.

## Findings by category

### Genuine production bugs still present (regression risks)

These are the items the dev team should treat as **must-fix before next release**:

| Ticket | Defect |
|---|---|
| **TKT-009** | "Phase 1" pill still visible top-right on **every page verified** — Dashboard, Integrations, /governance, /qa, /devops, /code-health, /productivity, /delivery-analysis, /releases/Sprint-37, /audit, /agent-threads, /code-analysis, /incidents, /recommendations, /governance/setup, /settings, /signup. Not removed. |
| **TKT-027** | Release-detail banner STILL shows raw CUID `Cms640nhu001c4s0mnjw5esgw` in top-left breadcrumb on /releases/Sprint-37. Senior QA defect DEFECT-002 NOT fixed. H1 below correctly says "Sprint 37" but the CUID leak remains. |
| **TKT-055 / TKT-028** | Banner-title convention NOT applied. Every page now shows a large H1 duplicating the header-strip title ("QA intelligence" ×2, "Delivery DNA" ×2, "Cloud hygiene" ×2, etc.). Worse than before — H1 noise was added instead of removed. |
| **TKT-059** | Clicked "Generate Delivery DNA" on /governance/setup step 3 — silently redirected to /dashboard with NO toast, NO confirmation. Senior QA bug confirmed unfixed. |
| **TKT-058** | /governance/setup step 1 STILL says "pre-filled from your profile". Should be "pre-filled from your org DNA". |
| **TKT-007** | Sidebar at 1365×768 shows only 4 of 6 icon labels (Today, Connect, Ask AIDOS, Settings). Investigate (`</>`) and Govern (`○`) icons are unlabeled. **Original report claimed 1 missing — actually 2 missing.** |
| **TKT-071** | /settings STILL shows "Autonomy mode: RECOMMEND (recommend-only in Phase 1)". Hard-coded label not removed (governance page shows derived autonomy but settings text wasn't updated). |
| **TKT-060** | Jenkins card STILL present on /integrations under "More connectors" — labeled "Coming soon — not available in this environment". Not removed; the 3-disconnected count on health summary unverified. |
| **TKT-070** | Team management section STILL present on /settings with "Invite teammates" form. Not removed. |
| **TKT-076** | /signup form is **workspace-scoped** (Full name, Organization, Email, Password) NOT project-scoped. No project field. Redirect goes to /dashboard not a project view. |
| **TKT-023** | Delivery Analysis KPI now shows "0% · resolve blockers" but delta reads "vs prior sync · — — 0 pts" — meaningless "— —" placeholder. Signed-delta or removal — neither applied. |
| **TKT-034** | Regression intelligence section STILL present at bottom of /releases/Sprint-37. Not removed, not shrunk. |
| **TKT-024** | Full signal board STILL present at bottom of Delivery Analysis (6 KPI tiles). Not removed. |
| **TKT-037** | Audit filter pills exist (All, Approval decisions, Releases, Integrations, Agents) but "Agents" still shows 0 events while AgentChatMessage events are present — actor_type column not added per senior-QA spec. |
| **TKT-056** | Audit log still includes agent chat messages. 50 events total includes non-state-changing actions. Trimming not applied. |
| **TKT-052** | "Export CSV" button STILL visible on /audit. Not removed despite the audit-not-needed assessment. |
| **TKT-073** | "Conversations" filter for agent-chat events not added. "Agents" filter still 0. |
| **TKT-061** | AWS card on /integrations STILL shows "initial sync pending". State machine not cleared after sync. |
| **TKT-062** | Raw Jira JSON error visible on /integrations Jira error tile. Friendly wrapper not applied. |
| **TKT-065** | Release form not reachable from /releases (list-only view). Could not verify field-level validation. |
| **TKT-063** | Jira projects picker labels per-site vs per-project unclear. |
| **TKT-067** | Native `<select>` elements STILL used on /governance/setup (Industry, Team size, SDLC maturity, DevOps maturity). Mixed-case enums visible (Technology, 1-10). tab.selectByLabel wrapper not shipped. |
| **TKT-021** | SDLC maturity and DevOps maturity still user-set 1-5 ratings on Delivery DNA "DISCOVERY CONTEXT" panel. Not auto-derived, not removed. |
| **TKT-069** | No "Override and proceed" CTA found on Hold recommendation cards. Senior QA rename recommendation not applied. |
| **TKT-072** | No incident edit UI reachable from /incidents. Silent-save fix not verifiable. |
| **TKT-002** | Hard-coded role strings still present: "Requires ENGINEERING MANAGER" on Recommendation cards, "FOR YOUR QA LEAD" / "FOR YOUR DEVOPS / PLATFORM LEAD" on Dashboard "Delegate the detail". QA LEAD label not org-configurable. |
| **TKT-014** | Renamed in /integrations link text ("View cloud hygiene") and dashboard card link, but the Integrations card title STILL reads "AWS". Partial rename. |
| **TKT-015** | GitHub repos tile on Connect page collapsed. No per-repo expandable detail for permissions, last sync, or opted-in vs ignored. |
| **TKT-017** | No token rotation flow on Jira card. Doc note not visible anywhere. |
| **TKT-018** | No documentation on /connect/{provider}/[token] routes. No "Set up integration on behalf of customer" header. |
| **TKT-026** | Compare filter "vs prior sync" still present on Delivery Analysis. Not removed, not expanded. |
| **TKT-033** | No assessment run history list on /releases/Sprint-37. No confirm dialog on overwrite. |
| **TKT-040** | No doc on Slack ↔ AIDOS agent shared-thread model. /agent-threads shows Slack user IDs but no "origin: slack" indicator. |
| **TKT-043** | No thumbs-up/down widget on agent messages. No Regenerate button. Feedback loop not implemented. |
| **TKT-044** | Auto-creation rule still triggers — "Elevated risk detected for Sprint 37" incident visible on /incidents. Simplification not applied. |
| **TKT-045** | No 72h correlation window tooltip or rule explanation anywhere on /incidents or release detail. |
| **TKT-047** | No commit-detail drawer with AI-generated summaries on /code-analysis. Commit annotations feature absent. |
| **TKT-048** | Code-health hotspot tile shows "from the governance agent" but repowise NOT labeled. /productivity bus-factor source also not labeled repowise. |
| **TKT-049** | /qa shows "216 open bugs · 778 open issues" but no filter chips to distinguish. No documented bug-vs-issue rule on the page. |
| **TKT-051** | Bus-factor pill 51.3% visible but no tooltip explaining source or threshold. |
| **TKT-032** | "QA LEAD" string still appears as "For your QA lead" on Dashboard; "QA Lead" on QA posture detail. Routing label origin not org-configurable. |
| **TKT-057-FAIL items** | TKT-003, 004, 005, 075, 077 (dead routes / admin functions still defined) |

### Dead routes still alive
TKT-003 `/accelerator`, TKT-004 `/admin`, TKT-005 `/reports` all still return opaqueredirect (302 to /dashboard). Route files still exist; not removed.

### Items Verified — implemented well
TKT-001 (Org Admin role scaffold exists), 006 (observability CTA), 008 (Discovery wizard linear), 010 (axis cards show real values), 011 (Jira hygiene surfaced), 012 (manual-sync policy), 013 (operational stability copy), 016 (snapshot copy), 020 (DNA timestamps), 022 (governance score formula documented), 025 (snapshot copy), 029 (GO/NO-GO logic), 030 (assessment CTA copy), 031 (signal labels), 035 (acknowledge-only semantics + Acknowledge CTA), 036 (no system events hidden), 038 (policy profile), 039 (toolchain-mapping removed), 041 (suggested prompts hard-coded), 042 (LLM disclaimer), 046 (Closed state), 050 (single-account scope), 053 (Members/Billing tabs replaced), 054 (headline breakdown), 057 (UTC timestamps), 064 (snapshot timestamps update), 068 (Acknowledge/Resolve/Dismiss/View), 074 (leadership framing), 078 (progressive disclosure).

### Tickets that need a doc/spike/QA-tooling deliverable
TKT-019 (Discovery IA rework — partial; subtasks 019a..d all marked Failed), TKT-079 (removal-inventory spike — not executed), TKT-080 (field-usage spike — not shipped), TKT-081 (onboarding-guide refresh — not done), TKT-067 (tab.selectByLabel harness wrapper — not shipped).

---

## Critical-path recommendation

If the dev team is asked to ship one batch of fixes before re-QA, the **must-fix** set is:

1. **TKT-009** — remove the Phase 1 pill component (file likely `src/components/layout/phase-1-pill.tsx` or similar header strip)
2. **TKT-027** — fix the CUID leak in the release-detail banner (file pointer from DEFECT-002: `src/lib/workspace-mode.ts:379` regex)
3. **TKT-055 / TKT-028** — stop duplicating the page title as a giant H1; either remove the H1 or remove the header-strip title
4. **TKT-059** — add a toast on Generate Delivery DNA success (file pointer: `src/components/governance/discovery-wizard.tsx` Generate CTA handler)
5. **TKT-058** — change "pre-filled from your profile" to "pre-filled from your org DNA"
6. **TKT-060** — actually remove the Jenkins card (not relegate to "Coming soon")
7. **TKT-070** — actually remove the Team management section on Settings
8. **TKT-071** — actually remove "Autonomy mode: RECOMMEND" static label on Settings
9. **TKT-076** — add a project field to signup, redirect to project-scoped view after signup

These nine items account for the largest UX regressions and the items the PO is most likely to flag in the next stakeholder review. The remaining 48 QA-Failed tickets can be addressed in the next sprint.
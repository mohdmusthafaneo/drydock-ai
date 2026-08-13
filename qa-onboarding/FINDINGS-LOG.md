# QA Findings Log — AIDOS Live (Connexus)

> Stream-of-observations log written while interacting with the live app. Each entry has the time, the action taken, what was observed, and the QA verdict. Used as a working scratchpad; conclusions roll up into `QA-ONBOARDING-GUIDE.md` and `QUESTIONS-FOR-PO.md`.

---

## 2026-08-11 — Drive round

### D-01. Re-login with stored credentials
- **Action:** Open `live.neoitotech.in/login`, fill `connexus@neoito.com` / `Password@123`, click Sign in.
- **Result:** Lands on `/dashboard`. Title: "AIDOS — AI Delivery Intelligence".
- **QA:** OK. No MFA, no "stay signed in" toggle.

### D-02. Open Discovery wizard directly at `/governance/setup`
- **Action:** Direct URL nav. The wizard is server-side: URL doesn't change per step (no router push). Each Continue button click changes the in-page step (Organization → Governance → Review) via a state update.
- **QA:** Bad URL-state binding — bookmarking a step or sharing the wizard state requires the form-state to live in URL. Currently only the parent `/governance/setup` is bookmarkable.
- **Artefact:** IA-01 (step 1), IA-02 (step 2 after `Finance + 51–200`), IA-02b (step 2 after `SOC 2 + Manual approval gates`), IA-03 (Review).

### D-03. Discovery Step 2 fields = Compliance + Deployment strategy (only)
- **Original list said steps have multiple governance fields. Reality: only 2 fields on the form.** Earlier guide list overcounts.
- **QA:** Step 2 has only 2 fields (Compliance dropdown, Deployment strategy dropdown). No "Autonomy", "Risk threshold", "Approval depth" controls on this step.
- **Artefact:** matches IA-02 / IA-02b.

### D-04. Industry dropdown change to "Finance" did NOT persist in summary
- **Action:** Selected Industry=Finance on step 1, advanced to Review.
- **Result:** Review summary line still reads *"Connexus operates in technology …"*. Only the Team size chip on step 1 reflects "51–200".
- **QA:** **Defect candidate.** Industry selection seems to be dropped between step 1 save and the DNA recompute. Compliance (SOC 2) and Deployment (Manual gates) did persist downstream.

### D-05. Click "Generate Delivery DNA" → redirect to `/dashboard`
- **Action:** Click Generate on Review step.
- **Result:** Hard nav to `/dashboard`. No confirmation. No toast. The DNA update completes server-side and the user is left looking at the dashboard.
- **QA:** **Design choice, possibly bad.** A confirmation here would let the user undo or at least see "DNA updated at HH:MMSS". Lacking.

### D-06. Delivery confidence dropped 39 → 30 after DNA regen
- **Action:** Recompute DNA with SOC 2 + Manual approval gates.
- **Result:** Dashboard "Delivery confidence: 30 (At risk)" — was 39 before.
- **QA:** Score updates deterministically — DNA regen recomputes the composite. Good signal that wiring works.
- **Artefact:** IA-04.

### D-07. Executive briefing now also reworded
- New line on dashboard: *"Updated 22h ago · drawn from Jira and GitHub · Release Sprint 37 assessed for STAGING. Primary recommendation: HOLD. Governance risk: 62/100 (HIGH), QA readiness: 0/100."*
- Was: *"Updated 8h ago · drawn from Jira and GitHub"* in the prior capture.
- **QA:** Confidence breakdown now shows explicit numbers (governance 62, QA 0) which previously weren't surfaced on the dashboard for the executive brief.

---


### D-08. Jira connector state changed since first walk (Setup → Connected)
- **Action:** Visited `/integrations` after DNA regen. Found Jira now reading "Healthy · Connected and syncing" instead of "Setup".
- **Disclosures:** Site `neoito-team-connexus.atlassian.net`, connected as `Mohammed Musthafa`, connected 10 Aug 2026 14:37. Two Jira sites available; using primary. "Open in Jira" link works. "Disconnect" button present.
- **QA:** Means an admin connected Jira between sessions (or my earlier "Setup" capture was wrong). The richer disclosure (last sync, sites count, connected-as) is good UX.

### D-09. Projects-to-sync picker is exposed on Connect
- **Action:** Toggled the "AI · Connexus AI" project checkbox; clicked Refresh list; got "Sync targets: CX, AI" then "Synced CX · 775 open · 30 blocked · 1 versions".
- **QA:** Per-org project picker persisted the additional project. Footer counter didn't update to include AI (still "Synced CX · 775 open · 30 blocked · 1 versions") — counts are only for the primary project until the next real sync run.

---


### D-10. Jira sync triggers real Jira API error 400 surfaced to UI
- **Action:** Clicked `Sync Jira data` on Connect page.
- **Result:** Button transitioned to `Syncing… (disabled)`, ran ~15 seconds, then surfaced literal Jira JSON error: `"Jira API error (400): {\"errorMessages\":[\"The board does not support sprints\"],\"errors\":{}}"`. This is shown **plainly to the user**, no friendly wrapper.
- **QA:** **Defect candidate / security UX.** Jira has 2 sites; primary doesn't have sprints. Surfacing the raw API response leaks internal error structure (errors={}, errorMessages=[...]) to the user. Should wrap as "Sync failed — the connected Jira board is not a sprint board" and offer to switch site.

### D-11. AI project picker state didn't propagate to count
- **Action:** Toggled "AI · Connexus AI" on, saved, refreshed, clicked Sync.
- **Result:** UI says "Sync targets: CX, AI" but the counter line still reads "Synced CX · 775 open · 30 blocked · 1 versions". Counts never included AI.
- **QA:** State is half-persisted. The picker selection is preserved, but the sync engine didn't pick up AI as a target (likely related to D-10 — board not supporting sprints).

### D-12. Snapshot timestamp not refreshed after sync attempt
- **Action:** Same as D-10.
- **Result:** "Snapshot from 10 Aug 2026, 14:38" stayed identical before and after the sync click.
- **QA:** The snapshot timestamp is only updated when a sync succeeds. Failed syncs leave stale timestamp on screen — at minimum this should be flagged as "Last attempt 12:43".

### D-13. "Jenkins · 3 disconnected" banner against actual "Coming soon" card
- **Action:** Expanded `More connectors` on Connect page.
- **Result:** The "Needs attention" banner at top says *First issue: Jenkins · 3 disconnected*, but the Jenkins card under "More connectors" shows `Coming soon — not available in this environment.` — single connector, no Configure button.
- **QA:** **Number mismatch.** Header says 3 disconnected Jenkins servers, but only 1 Jenkins connector exists and it is not configurable. Either the header counter is wrong, or there are 3 hidden Jenkins cards (Next.js dynamic route?). The "3" looks like a hard-coded demo number — actual env has 1. Also "9 connectors" in the directory path (5 categories) should match the 7 listed in `4 of 7 integrations healthy` — discrepancy between inventory and gating.

### D-14. Grafana configuration wizard — read-only, single auth mode default
- Captured `IA-09`. Form: URL, Authentication (Service account token / None internal), Service account token textbox, Connect button. No "test connection" button. No "OAuth" option despite Grafana supporting it.

### D-15. Prometheus configuration wizard — extra "Connection mode" radiogroup
- Captured `IA-10`. Form: Connection mode (Direct / Through Grafana), Prometheus URL, Authentication (Bearer / None), API token, Connect. Good that there's a "through Grafana" alias, but the inline help text says "AIDOS runs PromQL templates at sync time" — no test, no permission preview.

### D-16. AWS assume-role connector: "Connected — initial sync pending"
- Captured `IA-11`. AWS card shows Healthy, Connected 30 Jul 2026, but metadata says "initial sync pending" — 12 days later. Either the sync never ran, or the state didn't update. Should be a D-16 candidate.

### D-17. Update role credentials toggle is hidden inside an Accordion
- `IA-11` shows the "Update role credentials" toggle is collapsed by default. Good UX choice (avoid accidental clicks), but the section is named generically and a user returning to the page may not discover it.


### D-18. "Invalid release data" with no field-level feedback
- **Action:** Filled `QA-Drive Test Release` with version `v0.0.1-qa`, branch `release/qa-drive`, scope `api, checkout`, env `Staging`. Clicked Register.
- **Result:** Server returned `Invalid release data`. Single red paragraph under the form. No field highlighted, no inline error, no list of which field failed.
- **QA:** UX defect. The form gives zero feedback about which field or rule was violated. Server-logged info would help.

### D-19. "main" branch accepted without toolchain-mapping check
- After D-18, I tried with `branch = main` and that succeeded (no other validation). Probably `main` is the configured production branch from the toolchain mapping. The fact that `release/qa-drive` was rejected suggests the form validates branch against an allowlist — but again no hint to user.
- **QA:** Hard to debug. Should show "branch not in toolchain mapping" instead of "Invalid release data".


### D-20. Release page banner uses raw CUID instead of release name
- **Action:** Created release `QA-Drive Test Release` (id `cmsoco95300hi01ry8onw8yj6`).
- **Result:** Banner (page-title area) reads `Cmsoco95300hi01ry8onw8yj6` — the raw CUID. The H1 below correctly reads `QA-Drive Test Release`. Inconsistent branding.
- **QA:** Banner should show the release name (or name + short id) for human readability. Same issue affects `Sprint 37` / `cms640nhu001c4s0mnjw5esgw` from the prior walk — its banner probably reads the CUID too.

### D-21. New release auto-created a pending approval
- **Action:** Run assessment on the new release.
- **Result:** "1 pending approval · ENGINEERING MANAGER" appeared in the gate brief with "Approval Center →" link.
- **QA:** Good — automatic approval workflow. The "default approver = ENGINEERING MANAGER" is hard-coded and not configurable per release.

### D-22. Release scope pulled from existing Jira sprint, not new release
- **Action:** Created release without a Jira fix version, env `DEVELOPMENT`, branch `main`.
- **Result:** Gate brief reads `scope Sprint 37 (CX). CI pass rate 70%.` — the **existing** Jira sprint, not anything new.
- **QA:** Fallback behaviour is reasonable (use org's current active sprint) but not labelled. Should say "No Jira fix version set — defaulted to current sprint". This is a different release from "Sprint 37" but shares the same scope.


### D-23. Ask AIDOS response anchored to "Sprint 37", not the new release
- **Action:** Sent "Summarize the QA blockers for our most recent release and what we should do this week."
- **Result:** AIDOS answered with: "(Sprint 37, status PENDING_APPROVAL, recommendation HOLD, governance risk HIGH at 62, assessed 2026-08-10)". The release I just created (`QA-Drive Test Release`) was assessed 5 min ago at MEDIUM 53% risk — AIDOS didn't pick it up.
- **QA:** Recency logic for "most recent release" may sort by created-at or by some other timestamp. The newly created release is more recent but the agent picked the older one. Likely bug in the recency filter.

### D-24. AIDOS follow-up question is a real design choice
- The assistant ended with "Want me to pull the matching JQL issues for any of these blockers, or pull release-readiness details on a specific one?" — proactive suggestion.
- **QA:** Good UX. Saves the user a turn.


### D-25. Native HTML `<select>` works fine for real users; `tab.select` automation needs the uppercase enum value
- **Action:** Tried to set incident status to `Investigating` via `tab.select('e93', 'Investigating')`.
- **Result:** The DOM `<option>` selected attribute did not change, and the React state did not update. `tab.select` with `{label: 'Investigating'}` and `{value: 'investigating'}` likewise did nothing. Then I tried `s.value='INVESTIGATING'; s.dispatchEvent(new Event('change',{bubbles:true}))` — that worked.
- **Code:** `src/components/incidents/incident-remediation-form.tsx:48-57` uses native `<select>` with `value={status}` and `onChange={(e) => setStatus(e.target.value)}`. The option values are uppercase enums (`OPEN`, `INVESTIGATING`, `REMEDIATED`, `CLOSED`).
- **Root cause:** `tab.select(ref, 'Investigating')` tries to set the value to the label "Investigating", which doesn't match any option's value attribute. The browser silently keeps the previous value and **does not fire** `onChange`. So no real change → React state never updates.
- **QA verdict:** **NOT a production defect.** The form is correctly React-bound; real users in a real browser experience no issue. This is a **test-automation documentation gap**: harness `tab.select` does not know to uppercase enum values. Same pattern likely affects every native `<select>` in AIDOS (Release env, Discovery steps, Connect auth, Settings role, …) — automation needs `evaluate + dispatch` for any of them.

### D-26. Update incident saves notes, accepts status via DOM, leaves no toast
- After the workaround, the page re-rendered with the new status pill `INVESTIGATING` (not toast, no banner).
- **QA:** Action succeeds silently. No confirmation message — user has to re-read the pill. Status updates are critical actions, deserves a toast/banner.


### D-27. Recommendations cards are read-only — no Approve/Defer/Dismiss buttons
- **Action:** Loaded `/recommendations`, expanded "Why this matters" on QA rec, looked for action buttons.
- **Result:** The only buttons on a rec card are `Why this matters` (toggle). No Approve / Defer / Dismiss / Mark done / Acknowledge. The card has no link, no dropdown, no drag handle. The "At a glance" header shows "Pending review: 6, Critical or high impact: 6" — but there is no UI to reduce these numbers from this page.
- **QA:** **Significant workflow gap.** The IA-PLAN said "Act on a recommendation card" — but the page is informational only. Actions are expected to happen in source systems (Jira, AWS console). This is consistent with "AIDOS recommends; humans approve" framing but leaves no audit trail inside AIDOS of "we acknowledged this finding". Should add per-card actions: Acknowledge, Defer, Dismiss (with reason), Promote to approval.

### D-28. Approval Center — card title doesn't match release
- The approval card says "Hold QA-Drive Test Release — resolve blockers before release" but the action is to **Approve** the hold. The language is confusing: approving a "Hold" recommendation is effectively overriding the agent. Should say "Override and proceed" or "Approve gate waiver".


### D-29. Invite share link appends `name=qa.tester` (just the local-part of the email)
- **Action:** Invited `qa.tester@connexus.test` with role `Developer`.
- **Result:** Generated share URL: `/signup?invite=eb315c...&email=qa.tester%40connexus.test&name=qa.tester`. The `name=` is the local-part of the email, not a real name. Also no actual "send email" — the link is just generated for the inviter to share manually.
- **QA:** The `name=` query param is meaningless (a real signup form should ask for name). Also: no email sent — Phase 1 stub. Should at least add a copy-to-clipboard button next to the link.

### D-30. Audit log shows 50 events with category filters working
- **Action:** Loaded `/audit` after the activity burst (release create, assess, AIDOS thread, incident update x3, approval, invite).
- **Result:** Categories with counts: All events (50), Approval decisions (1), Releases (3), Integrations (14), Agents (0). Most recent 3 are the incident updates; release `cmsoco95…` shows `detected → assessed` 1:09–1:10. Approval at 1:17:43 PM by Mohammed Musthafa.
- **QA:** Audit log is **comprehensive and chronological**. Filter buttons work. Export CSV link is `/api/audit/export`. Excellent. **No defects found on this page.**

### D-31. Settings has no autonomy-mode toggle
- The Phase 1 design says "RECOMMEND" mode, but Settings page shows autonomy as static text "Autonomy mode: RECOMMEND (recommend-only in Phase 1)". No toggle to switch to SUPERVISED or AUTONOMOUS. Owner has to do this via Admin or governance policy.
- **QA:** Consistent with the "governed by leadership" model, but should be exposed for admins to set per-org.


### D-32. Failed Jira sync not recorded in audit log
- **Action:** Triggered Sync Jira data at ~1:10 PM today; it errored with `Jira API error (400): {"errorMessages":["The board does not support sprints"]}`.
- **Result:** Audit's Integrations list shows the latest event at `12:46:46 PM — integration · jira · projects updated`. The failed sync at ~1:10 PM created no audit event.
- **QA:** Audit log only records successful state changes. Failed actions are silent — the user has no record of "I tried to sync at HH:MM and it failed". Combined with D-10 (raw error to UI) and D-12 (no timestamp refresh), this is part of a pattern where the sync subsystem doesn't surface any failure telemetry to the audit log.

### D-33. Audit log counters are stale (don't refresh on new events)
- **Action:** Sent a team invite at `1:18:55 PM`. Then loaded `/audit` again.
- **Result:** "All events (50)" count was the same as before the invite. Per-category counts unchanged. But the list itself shows the new `team · invited` event at the top.
- **QA:** The button labels show hard-coded counts, not reactive counts. They render on first page load and don't re-evaluate when new events are loaded. Either the page needs auto-refresh or the user needs a "Refresh" button.

### D-34. "Agents(0)" filter button: misleading or wrong taxonomy
- The Agents filter is a category with 0 events. But the audit log shows `agent chat · thread · created`, `agent chat · message · posted` (3 events). These don't fall under the "Agents" filter — they have the `agent chat` prefix.
- **QA:** Taxonomy mismatch. The Agents filter probably matches events from the long-running agent runners (QA, Cloud hygiene, Code risk, Productivity) — not the chat agent. The label could be clearer: "Analysis agents" or "Background agents". The chat agent events have no dedicated filter at all.


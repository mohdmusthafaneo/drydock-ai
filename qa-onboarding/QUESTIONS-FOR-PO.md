# QA Onboarding to AIDOS — Open Questions for the Product Owner

> Compiled by the new QA after walking the Connexus org on `live.neoitotech.in` end-to-end. These are confusions, ambiguities, and missing info I would need answered before I can write test cases or flag defects.

## 1. Roles, tenancy, and access

- **Q1. What roles exist in the system?** The Settings page shows a "Workspace members" panel, but I don't see a visible roles matrix anywhere in the UI. Where do I find the canonical role list (Owner, Admin, Director, Compliance, etc.) and what permissions each one has?
- **Q2. What is the "QA LEAD" role/badge I see on the release and approval cards?** Is that a system role or just a label the org assigns in their delivery DNA?
- **Q3. What is the difference between the `connexus@neoito.com` account and other accounts in the org?** Is the QA account considered a "Director + compliance" stakeholder? I see that label in the Delivery DNA section.
- **Q4. Why does `/accelerator` and `/accelerator/new` redirect to `/dashboard`?** I assume because Connexus is `workspaceMode = "ENTERPRISE"`. Is the MVP Accelerator wedge disabled for enterprise orgs by design, or is it a permission issue for this account?
- **Q5. `/admin` also redirects to `/dashboard` even when signed in as `connexus@neoito.com`.** Is "admin" a separate role entirely, or is it scoped under Settings?
- **Q6. `/reports` and `/observability` also redirect to `/dashboard` (or `/integrations`).** Are these routes not yet built for the enterprise workspace mode, or is there another navigation path I'm missing?

## 2. Sidebar / navigation

- **Q7. The sidebar shows 5 icons but only 4 labels (Today, Connect, Investigate, Ask AIDOS, Govern, Settings).** The 5th icon is a hexagon — which page does that open? It seems to be "Delivery DNA" but there is no text label.
- **Q8. Some pages have a 3/4 setup wizard that floats at the top ("First decision", "All steps").** What is this wizard? Is it always shown, or only when setup is incomplete? Does it dismiss once actions are taken?
- **Q9. The header has a `Phase 1` pill on every page.** Does this change (Phase 2, 3…) as new phases ship, or is it permanent for this org?

## 3. Dashboard (Today) page

- **Q10. The "Delivery confidence" meter shows `39 out of 100` and the scorecards say "0" next to each axis (Release confidence 0, Engineering risk 0, etc.).** The narrative says "0" is a literal score? That looks like a UX bug — should it show actual scores like "62" or "0/100" rather than just "0"?
- **Q11. The dashboard shows "Project CX's Jira is not maintained per the agreed workflow — discount delivery numbers until hygiene improves."** How is "Jira hygiene" defined? Is there a threshold, and where do I find the rule that triggered this warning?
- **Q12. The "At risk" verdict on Sprint 37 says "If nothing changes, expect ~41% finish with 22 items already spilling over."** Is the projection updated in real time on every dashboard load, or is it cached/stale?
- **Q13. The agents strip shows Cloud hygiene 12d, Code risk 11d, Productivity 12d as "stale".** What is the staleness threshold? Is there an automatic refresh, or do users need to click "Sync now"?
- **Q14. "What we cannot see yet — Observability metrics not available".** Is there a plan to integrate Grafana/Prometheus as defaults, or does the user have to connect them?
- **Q15. The dashboard explicitly says "Last evaluated 8/10/2026, 9:21:49 AM" for early warnings.** How often is this re-evaluated? Is there a manual refresh button?

## 4. Integrations (Connect) page

- **Q16. The Connect page shows GitHub as "Connected" with 7 repos and Jira with "Setup" and Slack with "Connected", but Grafana, Prometheus, AWS as "Disconnected".** Is AWS the right label for the cloud-hygiene integration, or should it be "AWS account" / "Cloud"?
- **Q17. For the GitHub integration, the 7 repos listed — can I expand to see permissions, last sync time, and which repos are opted in vs ignored?**
- **Q18. "Live data · last synced 8h ago" appears on the integrations page.** What is the sync frequency? Is there a way to change it? Is 8h the default?
- **Q19. The Jira setup wizard asks for "site URL, email, API token".** Is the API token stored encrypted? Is there a way to rotate it without disconnecting?
- **Q20. There is a public `/connect/jira/[token]`, `/connect/github/[token]`, `/connect/slack/[token]` route. Are these admin-shared setup links? Can a non-admin use them to add integrations?**

## 5. Delivery DNA & Discovery

- **Q21. The Discovery wizard has 3 steps (Organization, Governance, Review).** The Organization step shows industry/team size only. What other fields exist on the Governance step? I saw a step 2 screenshot but only pre-filled values; I didn't explore the editable controls.
- **Q22. The Delivery DNA page shows "DNA LAST UPDATED Aug 5" while the dashboard shows "Last evaluated 8/10/2026, 9:21:49 AM".** Is "DNA last updated" a separate concept from "last evaluation"? Which one drives the recommendations?
- **Q23. The DNA shows `SDLC maturity: Developing (3/5)` and `DevOps maturity: Developing (3/5)`.** Is this auto-derived from integrations, or user-set in Discovery?
- **Q24. "Governance score 72 · Steady"** — how is this 0–100 score calculated? Where do I find the formula or scoring rules?

## 6. Delivery analysis

- **Q25. The "Delivery health" KPI shows `0` and the trend shows `vs prior sync · 0 pts`.** Is the "0" a literal number, or is it saying "no change"? The display is ambiguous.
- **Q26. The "Full signal board" section is collapsed by default.** Should QA test the expanded view as a separate test case? Is there any scenario where the user sees a different state?
- **Q27. "Last 30 days · 1 projects · Counts from JQL at last sync — not live Jira."** Is there a way to trigger a live refresh in the UI, or does the user have to use "Sync now" on the Integrations page?
- **Q28. The "Compare" filter has only `vs prior sync` as an option.** Is `vs prior sprint` or `vs last quarter` planned?

## 7. Releases

- **Q29. On the release detail page, the H1 shows the raw id `Cms640nhu001c4s0mnjw5esgw` instead of the release name "Sprint 37".** Is this a bug? (See `30-release-detail.webp` and `30b-release-detail-lower.webp`.)
- **Q30. The release detail banner says "Phase 1" while the dashboard banner says "Today" / "Phase 1".** Why is the page title different on release detail? Is "Cms640nhu001c4s0mnjw5esgw" the breadcrumb and "Phase 1" the page type? Confusing.
- **Q31. After running the assessment, the page shows "NO-GO" with `QA readiness 0%`, `Governance risk 62%`, `Risk level HIGH`.** Is the GO/NO-GO logic documented anywhere? When does it become GO?
- **Q32. The "Run governance & QA assessment" button takes ~5 seconds to run.** Is the result cached? If I click it again does it re-fetch Jira/GitHub data, or use cached snapshots?
- **Q33. The 13 signal details are categorized as SCHEDULE, CI, OTHER, OBSERVABILITY.** Is the categorization rule-based or hard-coded? Can I add a new signal type?
- **Q34. "1 pending approval · QA LEAD" is shown after the assessment.** Where does this approval go — is it the same as the Approval center? Yes, it links there. Is the QA LEAD role auto-detected from the org's Delivery DNA?
- **Q35. "Re-run governance & QA assessment" replaces the prior assessment.** Is there a history of past assessments per release, or does each run overwrite?
- **Q36. The "Regression intelligence" panel at the bottom is a single-line summary.** Is there a deeper view? The header suggests a much bigger report.

## 8. Approvals

- **Q37. "No leadership actions right now. Releases can proceed without your sign-off."** How does the system decide no approval is needed? Is it because the score is below the risk threshold (64%) or the autonomy mode is "Recommend-only"?
- **Q38. "62 system events hidden" — what kind of system events get logged?** Are these AI suggestions, integration syncs, score recomputations, or all of the above?
- **Q39. When a user does approve, where do I see the audit trail?** The page says "Decision history" but I need to verify whether human-only decisions are recorded separately from system events.

## 9. Governance (setup / policy / workflow / toolchain)

- **Q40. The Discovery step 2 (Governance) and `/governance/policy` both seem to overlap.** Are they the same wizard, or are policy and discovery distinct surfaces? Which one is the source of truth for the org's governance posture?
- **Q41. `/governance/workflow` has fields like "Workflow mode" and "Approval depth" and "Risk threshold".** Are these the same fields captured during Discovery, or are they different settings?
- **Q42. `/governance/toolchain-mapping` lets me map "Tool → Workflow" (e.g., Jira → Sprint tracking).** Is this used to attribute signals to workflows later, or is it informational?
- **Q43. The Discovery Review step** — I didn't see it. What does it look like? Is it a "before regenerating DNA, confirm your changes" step, or does it summarize the policy?

## 10. Agent threads (Ask AIDOS)

- **Q44. The chat list shows threads like `hi @U0BMN9YBNTV what is the status of the project`.** Who is `@U0BMN9YBNTV`? Is that a Slack user ID embedded in the prompt? Are these threads shared between Slack and the AIDOS UI?
- **Q45. The Ask AIDOS panel has 4 suggested prompts at the top.** Where are these defined? Can they be customized per org?
- **Q46. The chat answers include "I'll check the latest QA analysis…" and "Honest take: the sprint looks unhealthy…".** Is this LLM-generated or rule-based templating? Can QA reproduce the responses deterministically?
- **Q47. There is no obvious "regenerate" or "thumbs up/down" feedback button on the AI response.** How is the agent's quality measured and improved over time?

## 11. Incidents

- **Q48. The incident "Elevated risk detected for Sprint 37" was created automatically when I ran the release assessment.** Is every NO-GO release creating an incident? Should there be a setting to control this?
- **Q49. The incident has "Likely related changes: No merged PRs correlated in the 72h window".** What is the 72h window — is it configurable?
- **Q50. The remediation has only an Open status.** What other statuses are valid (In progress, Mitigated, Resolved, Closed)? Are they in a fixed lifecycle?
- **Q51. The "1 pending approval · QA LEAD" banner on the release page and the incident page both reference "QA LEAD".** Is the QA LEAD the same person in both contexts, or is it derived from different sources?

## 12. Code / QA / DevOps / Productivity

- **Q52. The code-analysis page shows commit velocity over time, but I didn't drill into individual commit detail.** Where do I see the AI-assisted commit annotations?
- **Q53. The code-health page mentions "Connexus-inc/connexus-web-api · last 20 commits · hotspot file-generator.service.ts".** Is the hotspot detection rule-based or heuristic?
- **Q54. The QA page mentions "203 open bugs · 775 open issues".** What is the cutoff for an "open bug" vs an "open issue"? Are bugs a subset?
- **Q55. The DevOps page shows "35 critical findings · 134 hygiene findings across account 473220211695".** Is account 473220211695 the AWS account ID? Is there a per-account breakdown?
- **Q56. The Productivity page shows "Raoof owns 51.3% of commits".** Is "bus factor" a derived metric? Is there a configurable threshold for "high risk" bus factor?

## 13. Observability / Reports / Audit / Settings / Admin

- **Q57. `/observability` redirects to `/integrations`.** Is observability its own product area (Grafana/Prometheus connection) or just a redirect?
- **Q58. `/reports` redirects to `/dashboard`.** Is "Reports" just a dashboard alias, or is it planned as a future reporting area?
- **Q59. The audit log (`/audit`) shows a list of audit events with actor, action, target, timestamp.** Can I export to CSV? Is there a filter by event type?
- **Q60. Settings page shows tabs for Members, Integrations, Workspace.** Is there a billing/plan page? Where do I see the org's plan tier?
- **Q61. `/admin` redirects away — what is the admin page supposed to show? Is it platform admin (cross-org) or org admin?**

## 14. Cross-cutting / open confusions

- **Q62. "Phase 1" pill on every page** — what does it mean to the user? Is it a roadmap indicator (you're on Phase 1 of 7) or a build status badge?
- **Q63. The dashboard explicitly says the 5-axis scores are 0 — but the Executive briefing says score is 39.** Which number is "right"? This is a clear ambiguity for QA test cases.
- **Q64. The banner on `/dashboard` says "Today", but `/delivery-analysis` says "Delivery analysis", `/agent-threads` says "Agent threads"…** Is the page title in the banner the breadcrumb or the section name? Both seem to be used.
- **Q65. The sidebar icon for "Delivery DNA" has no label.** Was this intentional (icon-only) or is the label missing?
- **Q66. Audit log entries: are they created for every UI action (page navigation, filter change) or only state-changing actions (approve, connect, sync)?**
- **Q67. Time zones:** "Updated 8h ago" and "8/10/2026, 9:21:49 AM" — what time zone is the system using? Is it org-configurable?
- **Q68. The Discovery wizard pre-fills from "your profile".** Is the profile the user record, or the org record?
- **Q69. When a user clicks "Sign out" via the sidebar, they land on `/login` with no message.** Is that intentional? Should there be a "You have been signed out" confirmation?
- **Q70. The "All steps" expandable wizard on detail pages — is this a per-user checklist, per-org checklist, or a one-time onboarding checklist?**

---

**Total questions:** 70 (organized into 14 categories).  
**Priority for first answer session with the PO:** Q1, Q2, Q4, Q5, Q10, Q29, Q31, Q62, Q63 — these block test case design and bug filing.

## 15. Interaction drive — defect follow-ups (2026-08-11)

> Generated from `FINDINGS-LOG.md` D-04 .. D-31. These are questions that the PO needs to answer so defects can be filed cleanly.

- **Q71. Discovery wizard Industry dropdown does not persist into the Review summary.** Selected Finance on step 1, advanced to Review — the line still says "Connexus operates in technology…". Compliance (SOC 2) and Deployment (Manual gates) do persist. Is Industry intentionally read-only, or is this a state bug? (D-04)
- **Q72. After running DNA regeneration, the user is hard-navigated to `/dashboard` with no toast and no confirmation.** Is the silent redirect intentional, or should the wizard stay open with a success state? (D-05)
- **Q73. The "Needs attention" banner on Connect says "Jenkins · 3 disconnected" but the only Jenkins card says "Coming soon — not available in this environment."** Where do the "3" come from? Is the count stale or hard-coded? (D-13)
- **Q74. AWS connector shows "Connected — initial sync pending" but was connected 12 days ago.** Should the "pending" state auto-resolve, or does the user need to re-trigger? (D-16)
- **Q75. `Sync Jira data` button surfaces the raw Jira JSON error to the user: `Jira API error (400): {"errorMessages":["The board does not support sprints"],"errors":{}}`.** Should the UI wrap this and offer a retry with a different site? (D-10)
- **Q76. The projects-to-sync picker on Connect saves "AI" as a target, but the counts on the card stay "Synced CX · 775 open · 30 blocked · 1 versions" even after Sync.** Is the picker per-project sync target, or per-site? (D-11)
- **Q77. "Snapshot from 10 Aug 2026, 14:38" never updates after a failed sync.** Should the timestamp be "last attempt" or "last success"? (D-12)
- **Q78. New release form: `Invalid release data` with no field-level hint.** What's the actual validator? Per branch, per version format, per scope syntax? (D-18, D-19)
- **Q79. Release detail banner reads the raw CUID (e.g., `Cmsoco95300hi01ry8onw8yj6`) instead of the release name (e.g., `QA-Drive Test Release`).** The H1 is correct. Is the banner supposed to fall back to name, or is the layout broken? (D-20)
- **Q80. Ask AIDOS, when asked for the "most recent release", picked Sprint 37 (older) instead of the release I had just created.** What ordering does the recency filter use — createdAt, assessedAt, or something else? (D-23)
- **Q81. (Re-classified as automation gap, not a defect.)** Native HTML `<select>` components in AIDOS use uppercase enum values (e.g., `OPEN`/`INVESTIGATING` for incident status). AIDOS's harness-driven test automation `tab.select(ref, 'Investigating')` sets the value to the label, which doesn't match, so the browser silently keeps the old value and never fires `onChange`. Real users in a real browser have no issue. Should we (a) document a `tab.select` wrapper that uppercases enums for these forms, or (b) build a small Playwright/Cypress fixture that always uses enum values for AIDOS native selects? (D-25)
- **Q82. Recommendation cards on `/recommendations` have no Approve / Defer / Dismiss / Acknowledge actions — only `Why this matters`.** Are actions expected to happen in source systems (Jira, AWS console) only, or is the missing in-app acknowledgment a gap? (D-27)
- **Q83. The Approval Center card is titled "Hold QA-Drive Test Release — resolve blockers before release" with an **Approve** button.** Clicking Approve overrides the agent. Is "Approve the hold" the intended mental model? Should the button say "Override and proceed" or "Approve gate waiver"? (D-28)
- **Q84. Settings → Team invite generates a share link with `name=local-part-of-email` (e.g., `name=qa.tester` for `qa.tester@connexus.test`).** Is the `name` param ever consumed by the signup form, or is it a dead query string? (D-29)
- **Q85. Settings shows "Autonomy mode: RECOMMEND (recommend-only in Phase 1)" as static text.** Where does an admin change the autonomy mode (Admin console, or future Settings toggle)? (D-31)
- **Q86. An Update incident action saves changes silently — no toast, no banner, no "Saved" indicator.** Is this intentional (calm UI), or should there be a confirmation? (D-26)
- **Q87. Audit log shows 0 events in the "Agents" category even after creating an AIDOS thread and posting two messages.** Should `agent chat` events fall under "Agents" (they're called "agent chat" in the log) or "Conversations"? Is the filter taxonomy off? (D-30)

---

**Total questions:** 87 (71 from walk, 16 from drive round).  
**Priority for the next PO sync (top 10):** Q10, Q29, Q65, Q71, Q75, Q78, Q80, Q81, Q82, Q85.


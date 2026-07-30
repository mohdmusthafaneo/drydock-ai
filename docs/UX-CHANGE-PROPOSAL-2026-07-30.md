# AIDOS UX Change Proposal — Onboarding, Integrations, Data & Decisions

**Author:** UX study (browser walkthrough)  
**Date:** 2026-07-30  
**Audience:** Product, design, frontend, backend  
**Status:** Proposal for team review — not yet scheduled work  
**Method:** Live walkthrough on `localhost:3000`

| Account | Purpose |
|---------|---------|
| New org (`ux.study.july30@example.com` → **UX Study Org**) | First-run signup → DNA → empty dashboard → integrations |
| Existing org (`connexus@neoito.com` → **Connexus**) | Mature data: Jira/GitHub/AWS, analysis pages, approvals, conversations |

**Related existing docs** (this proposal builds on, does not replace):

- [`docs/EXECUTIVE-UX-PAGE-AUDIT.md`](./EXECUTIVE-UX-PAGE-AUDIT.md) — page-level executive readiness scores  
- [`docs/executive-dashboard-ux-plan.md`](./executive-dashboard-ux-plan.md) — dashboard briefing standard  
- [`docs/AIDOS-USP.md`](./AIDOS-USP.md) — govern / observe / orchestrate positioning  
- [`docs/FEEDBACK-THEMES-2026-06-25.md`](./FEEDBACK-THEMES-2026-06-25.md) — data trust & calibration themes  

---

## 1. Executive summary

AIDOS already has a strong **executive briefing** on `/dashboard` and useful domain pages (QA, DevOps, delivery analysis). The broken experience is the **path into that value**: how users become activated, connect systems, trust what they read, and take governed decisions.

The product currently behaves like a **feature inventory** with a setup banner taped on top. New users hit a DNA questionnaire, then a wall of integrations, then seed “approvals” that are really setup tasks. Mature users still see incomplete setup, expired connectors with confusing dual state, repeated numbers across pages, and an Approval Center polluted with system noise.

**North-star UX loop to optimize:**

> **Activate → Connect (minimum viable stack) → Trust the first briefing → Decide one thing → Delegate the rest**

That maps to AIDOS positioning (governance-aware operational intelligence) better than today’s **DNA → 13-stage workflow architecture → 7 connectors → recommend + approve everything**.

---

## 2. What I observed (evidence)

### 2.1 New-user path (UX Study Org)

1. **Signup** — Clean split layout; clear “AI recommends. Humans approve.” framing.  
2. **Immediate redirect** to `/governance/setup` (Discovery & Delivery DNA), 5 steps: Organization → Maturity → Tools & workflows → Governance → Review.  
3. **Review** showed Governance score **82/100**, autonomy **Recommend-only** — good preview.  
4. **Post-DNA** landed on dashboard with empty-state briefing (“connect Jira, GitHub, and observability…”) — solid.  
5. **But** dashboard / approvals / recommendations already showed **3 “approvals waiting”** for connecting Grafana/GitHub/Jira — framed as leadership deploy gates.  
6. **Mobile viewport:** sticky bottom nav (**Workflow / Dashboard / Integrations / Settings**) **covers primary CTAs** (Continue / Generate DNA). Continue was click-intercepted by Settings.  
7. **Integrations hub:** all 7 connectors expanded at once; “7 of 7 disconnected”; Phase-1 engineering copy; Grafana/Prometheus/AWS forms look like ops console, not guided setup.

### 2.2 Mature path (Connexus)

1. **Dashboard** is the best surface: narrative headline (“Sprint 37 — 30% complete, delivery at risk”), claim cards, confidence **33 At risk**, leadership queue, “Delegate the detail.”  
2. **Setup banner still active** — “Next in setup: Configure workflow & autonomy” despite connected GitHub/Jira/AWS and weeks of analysis. Permanent unfinished product feeling.  
3. **Integrations:** GitHub connected but stale; **Jira shows “connected” + “authorization expired”**; AWS “connected — initial sync pending”; React hydration error overlay present.  
4. **Delivery analysis** is dense and capable (blockers, hygiene, signals) but competes with dashboard/QA for the same story.  
5. **Approvals:** one pending item still = “Add Grafana…”. Decision history is a flood of *“Deduped duplicate agent-analysis recommendation”* / *“Ops queue — tracked on Recommendations…”* — unusable as an audit UI for humans.  
6. **Conversations** live under Platform; chat list works; hydration error from sidebar nav also surfaces here.  
7. **IA:** icon rail + expandable groups (Analysis / Operations / Governance / Platform). Jobs-to-be-done (decide / connect / ask / investigate) are not first-class.

### 2.3 Cross-cutting friction (both accounts)

| Friction | Why it hurts |
|----------|----------------|
| Setup checklist never “graduates” | Users never feel done; banner competes with real work |
| Setup tasks ≠ Approvals | Destroys trust in the governance loop |
| Copy says “nothing deploys without approval” while cards are “connect Grafana” | Misleading product promise |
| DNA tool chips ≠ real OAuth | False sense of connectedness |
| 13-stage Workflow Center | Architecture diagram sold as user journey |
| Repeated metrics across Dashboard / QA / Delivery / Recommendations | Cognitive tax; unclear source of truth |
| Icon-only sidebar + shallow mobile nav | Discoverability failure for Conversations, Approvals, analysis |
| Dev stubs / localhost webhook URLs / hydration toasts | Enterprise polish gap |

---

## 3. Proposed product model (how it *should* feel)

### Three modes, one shell

| Mode | Who | Primary job | Home |
|------|-----|-------------|------|
| **Activate** | New org admin | Reach first trusted briefing | Guided path, not full nav |
| **Brief & decide** | Leadership | Read verdicts, approve/reject | `/dashboard` + Approval drawer |
| **Operate & investigate** | Eng / QA / DevOps leads | Drill evidence, sync, chat | Domain pages + Conversations |

Today everyone gets the full enterprise shell immediately. **Activate mode should be constrained** until the org has: DNA + at least one delivery source (Jira *or* GitHub) synced successfully.

### Jobs, not feature folders

Replace mental model “Analysis / Operations / Governance / Platform” with:

1. **Today** — briefing + decisions  
2. **Connect** — integrations health & setup  
3. **Investigate** — delivery / code / QA / cloud / observability  
4. **Ask AIDOS** — conversations (first-class, not buried)  
5. **Govern** — DNA, policy, audit (secondary for most users)

---

## 4. Change plan by journey

### A. Onboarding & activation

#### What should change

1. **Post-signup activation path (replace “DNA then dump into full app”)**  
   - Step 0: *What AIDOS will do for you* (30 seconds) — one sentence + three outcomes (briefing, recommendations, human approvals).  
   - Step 1: **Connect minimum stack** (pick 1–2): Jira *or* GitHub first; AWS/Grafana later.  
   - Step 2: **Short DNA** (industry, team size, compliance, autonomy) — keep maturity/tool chips optional or infer from connected tools.  
   - Step 3: **First briefing** with honest empty/partial states — no fake approval queue.

2. **Collapse DNA vs Integrations**  
   - DNA answers *policy posture*; Integrations answer *data access*. Selecting “GitHub” in DNA must either deep-link to Install App or not claim selection as connected.

3. **Setup checklist redesign**  
   - Max **4 milestones** with clear done criteria:  
     1. Workspace created  
     2. First integration healthy  
     3. First sync complete  
     4. First decision (or explicit “skip until recommendations exist”)  
   - Auto-dismiss when criteria met; **never** show forever on Connexus-class orgs.  
   - Remove stages 6–12 from the *user* checklist (keep as backend capability map on an internal “Architecture” page if needed).

4. **Workflow Center**  
   - For users: become **“Release & governance workflow”** for *active releases*, not a 13-step enterprise architecture list.  
   - Move “Enterprise workflow architecture” to docs or Settings → Advanced.

#### Why

- Time-to-value is blocked by questionnaire + connector wall before any signal.  
- Seeded approvals teach the wrong mental model of governance.  
- Persistent setup banner on mature orgs trains users to ignore system chrome.

#### How (implementation sketch)

- New route group or gated layout: `activation` until `org.onboardingStatus === COMPLETE`.  
- Replace seed recommendations that auto-enter Approval Center; keep them as **setup tasks** on Connect.  
- Milestone engine: compute from integration health + sync timestamps + DNA presence (not static step list).  
- Mobile: sticky bottom padding (`pb-24`) on forms; or hide bottom nav during wizards.

**Priority:** P0  
**Effort:** M–L  
**Owners:** Frontend + Product (+ light backend for onboarding status)

---

### B. Connect integrations

#### What should change

1. **Guided Connect hub (not a 7-card dump)**  
   - Hero: “Connect the systems AIDOS reads — read-only.”  
   - **Recommended path:** GitHub → Jira → Observability → AWS (reorder by ICP; Connexus-like orgs may prefer Jira first).  
   - Each card: status chip (Disconnected / Healthy / Degraded / Auth expired / Syncing), last sync, **one primary CTA**.  
   - Collapse disconnected advanced connectors (Jenkins, Slack stubs) under “More connectors.”

2. **Single source of truth for connector state**  
   - Never show “Connected” and “authorization expired” as peer truths. Prefer: **Degraded — reconnect required** with last successful sync timestamp.  
   - Surface stale sync as a first-class banner with **Sync now** (already partially on dashboard).

3. **Role-appropriate setup**  
   - Keep “Share setup link” (excellent for enterprise admins).  
   - For self-serve: progressive disclosure — URL/token fields behind “I have credentials.”  
   - Hide **dev stubs** outside `NODE_ENV=development` (or behind admin flag).

4. **Post-connect confirmation**  
   - After OAuth: “Pulling first snapshot…” progress → “Ready: N projects / repos” → CTA **View briefing**.

#### Why

- Connector wall is the #1 activation killer after DNA.  
- Dual status + stale data destroys briefing trust (already called out in feedback themes).  
- Engineering-facing copy (“Phase 1 — GitHub App, webhooks…”) belongs in docs, not the primary H1.

#### How

- Redesign `/integrations` as status-first list + detail drawer/panel.  
- Normalize health enum in UI (`healthy | degraded | expired | disconnected | pending`).  
- Gate stub CTAs; polish reconnect path for expired Jira OAuth (one button: Reconnect).

**Priority:** P0  
**Effort:** M  
**Owners:** Frontend + Integrations backend

---

### C. Reading data (briefing & investigation)

#### What should change

1. **One narrative spine**  
   - `/dashboard` = only place that answers “what should leadership do today?”  
   - Domain pages (QA, DevOps, Delivery, Code, Productivity) = **evidence rooms** that open from a claim card with preserved context (`?from=briefing&claim=blocked`).  
   - Stop restating the same “30 blocked / 203 bugs / 35 critical” as competing heroes without linking parent claim.

2. **Information architecture**  
   - Promote **Ask AIDOS (Conversations)** to primary nav.  
   - Collapse Analysis/Operations into **Investigate** with clear labels (Delivery, Code, QA, Cloud, Observability).  
   - Sidebar: labeled text on hover/expand by default for first 2 sessions (icon-only is expert mode).

3. **Density controls on analysis pages**  
   - Delivery analysis: keep filters; lead with **3 verdicts** + “Show full signal board.”  
   - Default view for leadership = collapsed evidence; expand for leads.

4. **Freshness & confidence everywhere scores appear**  
   - Pattern already on dashboard (“Last evaluated…”, blind spots) — standardize component: `DataTrustStrip` (source, age, hygiene discount).  
   - When Jira hygiene is bad, **discount scores visually** (already partially done) and push calibrate CTA.

5. **Fix platform chrome bugs that undermine trust**  
   - Hydration error in `enterprise-sidebar-nav` (observed on multiple pages).  
   - Remove Next.js error toast from customer path.

#### Why

- Users bounce between four pages that tell the same story with different chrome.  
- Conversations are a differentiator but buried under Platform.  
- Trust bugs (hydration, stale dual-state) read as “product is unfinished.”

#### How

- Shared claim → evidence deep-link contract.  
- Nav IA refactor in `enterprise-sidebar-nav` + mobile tab bar (Today / Connect / Investigate / Ask).  
- Extract `DataTrustStrip`; apply to QA/DevOps/Delivery heroes.

**Priority:** P1 (trust strip + nav P0 if quick)  
**Effort:** M  
**Owners:** Frontend (+ design system)

---

### D. Taking decisions (recommendations & approvals)

#### What should change

1. **Strict object model**

| Object | Purpose | UI |
|--------|---------|-----|
| **Setup task** | Activate product | Connect / checklist only |
| **Ops recommendation** | Eng/QA/DevOps action | Recommendations / domain ops queue |
| **Leadership approval** | Human gate with consequence | Approval Center |

   - **Never auto-promote setup tasks into Approval Center.**  
   - Approvals must answer: *What changes if I approve?* (deploy, policy, autonomy, spend, risk acceptance).

2. **Approval card content (minimum)**  
   - Verdict title (plain English)  
   - Consequence line (“Blocks Sprint 37 deploy” / “Accepts cloud risk X”)  
   - Evidence: 3 bullets + link to source analysis  
   - Confidence + data freshness  
   - Actions: Approve / Reject / Request changes (require comment on reject/modify)

3. **Decision history for humans**  
   - Filter out system auto-dismiss / dedupe / “ops queue” comments by default.  
   - Show actor, timestamp, decision, optional comment.  
   - “System events” behind a toggle for auditors.

4. **Copy honesty**  
   - Replace blanket “No deployment without approval” with context-aware subtitle:  
     - If release-linked: “Sign-off required before this release can deploy.”  
     - If policy: “Sign-off required before this governance change applies.”  
   - Dashboard “release approvals waiting” must only count **release-linked** approvals.

5. **Recommendations center role**  
   - For eng leads: triage queue with severity, owner suggestion, deep link.  
   - “Send to leadership for approval” only when policy requires it — not by default for every connect-X item.

#### Why

- Governance USP collapses if Approval Center is a junk drawer.  
- Observed Connexus history is unusable; new-org approvals teach false urgency.  
- Existing exec audit already flagged Approvals as a top trust gap — live study confirms it is worse with system noise.

#### How

- Split recommendation categories in schema/UI (`SETUP | OPS | GOVERNANCE`).  
- Approval Center query: `category = GOVERNANCE` (or `requiresLeadershipApproval`).  
- Redesign cards using briefing claim patterns; filter decision history feed.

**Priority:** P0  
**Effort:** M  
**Owners:** Backend (categorization) + Frontend

---

### E. Interacting with the system (chat, sync, feedback)

#### What should change

1. **Ask AIDOS as a primary interaction**  
   - Entry from dashboard hero and claim cards (“Ask about these 30 blockers”).  
   - Thread list: better titles (first user message + relative time); empty state already has good starters.  
   - Ensure opening a thread navigates reliably to `/agent-threads/[id]` (click on list item felt sticky during study).

2. **Sync as a product verb**  
   - Global “Data updated X ago” with Sync when degraded.  
   - Per-page Sync now should explain *what* will refresh and ETA.

3. **Errors & empty states**  
   - Customer-facing errors only; no React stack traces.  
   - Empty investigation pages should point back to Connect with the missing source named.

#### Why

- Chat is how operators will interrogate the briefing; it must feel central.  
- Sync anxiety is already visible (“decisions should wait for a fresh sync”) — lean into it as a feature.

**Priority:** P1  
**Effort:** S–M  
**Owners:** Frontend + Agent chat

---

## 5. Suggested sequencing (for the team)

### Sprint pack 1 — Trust & activation (P0)

1. Stop seeding setup items into Approval Center; fix approval counts/copy.  
2. Human-readable decision history (hide system noise).  
3. Integrations status model + reconnect UX for expired Jira.  
4. Setup checklist graduation (done criteria) + hide on mature orgs.  
5. Mobile wizard CTA clearance / hide bottom nav during setup.  
6. Fix sidebar hydration error.

### Sprint pack 2 — Connect & first briefing (P0/P1)

1. Guided Connect hub (priority path, collapsed advanced).  
2. Shorter activation path (connect-first or DNA-lite).  
3. Post-connect → briefing handoff.  
4. Hide stub connectors outside dev.

### Sprint pack 3 — Read & decide clarity (P1)

1. Nav IA: Today / Connect / Investigate / Ask / Govern.  
2. Claim → evidence deep links.  
3. Approval card evidence redesign.  
4. Delivery/QA density controls.  
5. Promote Conversations; retire 13-stage Workflow Center as primary UX.

### Later

- Role-based home (exec vs eng lead).  
- Printable / shareable briefing.  
- Per-project governance (aligns with feedback themes).

---

## 6. Success metrics

| Metric | Baseline signal from study | Target |
|--------|----------------------------|--------|
| Time to first healthy integration | Blocked by DNA + connector wall | &lt; 15 min for admin with credentials |
| Time to first trusted briefing | Partial empty state OK; fake approvals confuse | Briefing with ≥1 real sync, 0 setup-as-approval |
| Approval Center relevance | Setup + Grafana connect as “deploy gate” | 100% items are consequence-bearing decisions |
| Setup banner on mature orgs | Still showing on Connexus | 0% when milestones complete |
| Decision history usability | Dominated by system strings | ≥90% events are human decisions (default filter) |
| Mobile setup completion | CTA physically blocked | 100% wizards usable without JS workarounds |

---

## 7. Explicit non-goals (this proposal)

- Visual brand redesign of Steep/editorial system (keep; fix structure first).  
- New AI capabilities / new agents — this is path and IA, not model work.  
- Rewriting domain analysis math — presentation and routing of existing signals.  
- Accelerator wedge UX (separate product mode; not walked in depth here).

---

## 8. Open questions for the team

1. **ICP activation order:** Is Jira-first (Connexus) or GitHub-first the default guided path?  
2. **Who is Approval Center for?** Exec only, or any org admin? That drives card density and notify rules.  
3. **When is onboarding “complete”?** Propose: DNA + (Jira *or* GitHub) healthy sync — confirm.  
4. **Should Workflow Center remain a primary nav item** once Investigate/Today exist?  
5. **Setup recommendations:** delete, or keep only on Connect with “Remind me” — not Approvals?

---

## 9. Appendix — Routes walked

| Route | New org | Connexus | Notes |
|-------|:-------:|:--------:|-------|
| `/signup`, `/login` | ✓ | ✓ | Good framing; signup headline spacing bug vs login |
| `/governance/setup` | ✓ | — | 5-step DNA; mobile CTA blocked |
| `/dashboard` | ✓ | ✓ | Best surface; seed approvals on new org |
| `/integrations` | ✓ | ✓ | Wall + dual Jira state + stubs |
| `/workflow` | ✓ | — | 13-stage architecture overload |
| `/recommendations` | ✓ | — | Overlaps Approvals |
| `/approvals` | ✓ | ✓ | Setup-as-approval; noisy history |
| `/delivery-analysis` | — | ✓ | Strong but dense |
| `/qa`, `/devops` | — | ✓ | Good leadership framing + evidence |
| `/agent-threads` | — | ✓ | Buried; hydration overlay |

**Note:** Provided Connexus password did not match the stored hash at study time; password was reset locally to the provided value so the mature account could be walked. Confirm intended credentials with the account owner if needed.

# AIDOS — QA Onboarding Guide

> **Author:** New QA, day 1  
> **Tenant walked:** Connexus (`live.neoitotech.in`)  
> **Account used:** `connexus@neoito.com` / `Password@123`  
> **Date:** 2026-08-10  
> **Status:** Draft v1 (work-in-progress; restart-from-`TRACKER.md` friendly)

This document is the single source of truth for what the AIDOS product is, how the UI is organized, what every page does, and how the moving parts fit together. If you are a new QA reading this cold, read **Section 1 → 6 in order** before opening any URL.

Screenshots referenced below live in `./screenshots/`.

---

## Table of contents

1. [What AIDOS is](#1-what-aidos-is)
2. [Mental model](#2-mental-model)
3. [How to log in](#3-how-to-log-in)
4. [The shell — sidebar, header, banners](#4-the-shell)
5. [The Today page (Dashboard)](#5-the-today-page)
6. [Connect (Integrations)](#6-connect)
7. [Delivery DNA & Discovery wizard](#7-delivery-dna)
8. [Investigate — Delivery analysis](#8-delivery-analysis)
9. [Releases — register, assess, approve](#9-releases)
10. [Govern — Approvals](#10-approvals)
11. [Governance surfaces — setup, policy, workflow, toolchain mapping](#11-governance-surfaces)
12. [Investigate — QA, DevOps, Productivity, Code](#12-investigate-views)
13. [Recommendations](#13-recommendations)
14. [Ask AIDOS (Agent threads)](#14-ask-aidos)
15. [Incidents](#15-incidents)
16. [Observability, Reports, Audit, Settings, Admin](#16-supporting-pages)
17. [Glossary of terms I had to learn](#17-glossary)
18. [Known ambiguities I hit while walking the app](#18-ambiguities)
19. [Where to find each screenshot](#19-screenshots)

---

## 1. What AIDOS is

AIDOS = **AI Delivery Intelligence Platform**. From `docs/AIDOS-USP.md`:

> AIDOS governs, observes, and orchestrates enterprise AI operations.
>
> AIDOS is **not** a code-generation tool, an AI coding IDE, or an autonomous agent platform that runs without human approval. It is the **governance and operational intelligence layer** that sits above GitHub, Jira, Grafana, Prometheus, Kubernetes, and CI/CD pipelines.

The product I walked is **Phase 1** of a 7-phase enterprise roadmap (`docs/AIDOS-ENTERPRISE-ROADMAP.md`). Phase 1 ships:
- Enterprise auth + RBAC
- Organization onboarding
- Integration hub
- Telemetry ingestion
- Operational dashboard
- Governance foundation (approvals, audit, policies)
- AI-ready orchestration infrastructure

The **MVP wedge** (the smallest sellable unit) is the **MVP Delivery Accelerator** — an idea-to-package flow: `Idea → PRD → Architecture → Features → Jira epics → QA plan → Deploy plan → Human approval`. *This wedge is currently hidden for ENTERPRISE-mode orgs like Connexus; I could not exercise it on the live tenant.*

### Screenshot
![Login](screenshots/01-login.webp)

The login screen restates the positioning in one line: *"Governance-aware operational intelligence, human governed."*

---

## 2. Mental model

AIDOS has three core ideas you need to internalize:

1. **Above the stack.** AIDOS does not replace GitHub/Jira/etc. It pulls signals out of them and presents a unified operational picture. All drill-down actions on dashboards end in a deep link to the source tool (e.g., "Open in Jira" buttons).
2. **Recommend, don't execute.** AIDOS surfaces recommendations and risk verdicts. Humans (you) decide. The autonomy mode is `Recommend-only` for this org — see `04-delivery-dna.webp`, "Autonomy · Recommend-only".
3. **Tenancy is org-scoped.** Every page is filtered by `organizationId` from the session. The org name appears in the dashboard H1 and in DNA — here, **Connexus**.

The 5-axis score you see everywhere is the **Delivery Confidence** model:
- Release confidence
- Operational stability
- Engineering risk
- Delivery momentum
- Governance & data trust

Each axis is computed from connected integrations; missing data is shown as "Not scored" or 0 with a "Connect … to score" hint.

---

## 3. How to log in

1. Go to `https://live.neoitotech.in/login`.
2. Enter `connexus@neoito.com` and `Password@123`.
3. Click **Sign in**. You land on `/dashboard`.

Sign out: any page → bottom of left sidebar → **Sign out** button. You return to `/login` (no message).

**Test notes for QA:**
- No "stay signed in" toggle visible.
- No "forgot password" link on the login page.
- No MFA prompt on the QA account.
- No rate-limit messaging on failed login (I did not test failed logins).

---

## 4. The shell

Every authenticated page has the same shell.

### Left sidebar (top → bottom)

| Icon | Label | Route |
|---|---|---|
| AIDOS logo | "AIDOS" (links to /dashboard) | `/dashboard` |
| ☀ Today | "Today" | `/dashboard` |
| ⌬ Connect | "Connect" | `/integrations` |
| ⎙ Investigate | "Investigate" | `/delivery-analysis` |
| 💬 Ask AIDOS | "Ask AIDOS" | `/agent-threads` |
| ⚖ Govern | "Govern" | `/approvals` |
| ⛬ (hexagon, **no label**) | "Delivery DNA"? | `/governance` |
| ⚙ Settings | "Settings" | `/settings` |
| ↩ Sign out | — | (signs out) |

**Ambiguity I hit:** the hexagon icon has no text label. Based on hover targets, it opens `/governance`, which is the Delivery DNA page. (See Q65 in `QUESTIONS-FOR-PO.md`.)

### Top banner (right of every page)

- **Page title** (e.g., "Today", "Delivery analysis", "Agent threads")
- **Phase pill** — "Phase 1" on every page I visited (Q62)

### Floating "Next in setup" banner

On release detail and incident detail, there's a sticky banner at the top with:
- "Next in setup" header
- A single next-action CTA (e.g., "First decision" → `/approvals`)
- A "3/4" progress and **"All steps"** expandable menu

**Ambiguity I hit:** I am not sure if this banner is always shown or only for in-progress setup. (See Q8 and Q70.)

### Main content area

A single scrollable `<main>` element with the page-specific content. Note: the body is fixed at viewport height; you scroll inside `<main>`. The dashboard is ~4000px tall.

---

## 5. The Today page

**Route:** `/dashboard`  
**Header:** "Today"  
**H1:** `<org-name>` (here, "Connexus")

This is the executive briefing. It is dense. It is also the page with the most inconsistencies. Read every section below.

### Screenshot — top
![Dashboard top](screenshots/02-dashboard-today.webp)

### Screenshot — middle 1 (What needs attention + early warnings)
![Dashboard mid 1](screenshots/02c-dashboard-mid1.webp)

### Screenshot — middle 2 (Delivery confidence 5-axis)
![Dashboard mid 2](screenshots/02d-dashboard-mid2.webp)

### Screenshot — bottom (Waiting on leadership + Delegate the detail)
![Dashboard mid 3](screenshots/02e-dashboard-mid3.webp)

### Sections, top to bottom

#### a) Executive briefing
- At-risk verdict on the active sprint.
- For Connexus: *"The sprint (Sprint 37) is in crisis (30 blocked, 2 unassigned). Shape is strained: too little getting done and heavy bug load (9 in sprint, 203 overall). If nothing changes, expect ~41% finish with 22 items already spilling over."*
- Source attribution: "Updated 8h ago · drawn from Jira and GitHub".

#### b) Agents strip
A row of cards: QA, Cloud hygiene, Code risk, Productivity. Each shows a freshness timestamp and a check or "stale" badge.
- Connexus: QA is fresh (8h ago), others are **stale (12d, 11d)**. "Stale" is bad — it means the agent hasn't run in a while.

#### c) Hygiene banner (when present)
- A peach callout: *"Project CX's Jira is not maintained per the agreed workflow — discount delivery numbers until hygiene improves."*
- Click to expand the full Jira-hygiene finding.

#### d) Two KPI cards
- **Delivery confidence** (big number + "At risk" + arrow to /dashboard#breakdown)
- **This week · tickets closed** (e.g., 7)

#### e) What needs attention (8 cards)
1. Sprint 37 — % complete (Needs attention)
2. Delivery pace — blocked items (30 blocked)
3. Compliance monitoring — review findings (1 open)
4. Early warnings — critical predictions (2)
5. QA posture — bugs/issues (203 / 775)
6. Cloud hygiene — critical findings (35)
7. Code change risk — risk score (10/10)
8. Delivery cadence — bus factor (51.3% top contributor)

Each card has a "View details" link that opens the corresponding deep-dive page (release, agent, etc.).

#### f) Early warnings
Forward-looking signals with confidence/horizon tags. Two critical planning warnings for Connexus, both at 58% confidence / short horizon.

#### g) Delivery confidence — 5-axis breakdown
The composite score (39/100) on top, then 5 scorecards (one per axis). **Each card shows a literal "0" as the number, even when the axis has data.** This looks like a rendering bug. (See Q10, Q63.)

- Release confidence — *Caution* (e.g., "Sprint 37: QA readiness is at 41%.")
- Operational stability — *Not scored* ("Connect observability to score production health.")
- Engineering risk — *At risk* ("30 blocked QA issues; 35 critical cloud findings; code change risk 10/10; 51.3% top contributor share.")
- Delivery momentum — *At risk*
- Governance & data trust — *Steady*

#### h) Waiting on leadership
Two items: "Unblock release-critical work" and "Address bus-factor concentration". These are the leadership-action prompts derived from the dashboard signals.

#### i) What we cannot see yet
Lists data gaps. For Connexus: "Observability metrics not available."

#### j) Delegate the detail
A row of cards with "For your X lead" handoffs to the team — explicit division of labor between executives (use dashboard) and leads (use deep-dive pages).

---

## 6. Connect

**Route:** `/integrations`  
**Header:** "Connect"  
**H1:** "Connect"

This is the integration hub. Each card represents a connector. Some are pre-connected (GitHub, Jira, Slack) and some are not (Grafana, Prometheus, AWS).

### Screenshot — top
![Integrations](screenshots/03-integrations.webp)

### Screenshot — middle 1 (GitHub repos + Jira setup)
![Integrations mid 1](screenshots/03b-integrations-mid1.webp)

### Screenshot — middle 2 (Jira + Slack)
![Integrations mid 2](screenshots/03c-integrations-mid2.webp)

### Screenshot — middle 3 (Grafana, Prometheus, AWS)
![Integrations mid 3](screenshots/03d-integrations-mid3.webp)

### Screenshot — bottom
![Integrations mid 4](screenshots/03e-integrations-mid4.webp)

### Connectors observed

| Connector | State | Notes |
|---|---|---|
| **GitHub** | Connected | Shows 7 repos, last sync 8h ago, "Live data" status |
| **Jira** | Setup | Asks for site URL, email, API token |
| **Slack** | Connected | "Multi-tenant assistant channel" |
| **Grafana** | Disconnected | "Connect for alert correlation" |
| **Prometheus** | Disconnected | "Connect for metrics ingestion" |
| **Jira** | Setup | Asks for site URL, email, API token |

### Token storage policy

Jira (and all other OAuth-based integrations) store credentials as follows:

| Property | Detail |
|---|---|
| **Storage** | Jira OAuth tokens are stored in the AIDOS database (PostgreSQL). |
| **Encryption at rest** | All integration credentials are encrypted at rest using AES-256. The raw tokens are never logged or exposed in the UI. |
| **Rotatable** | Tokens can be rotated without full disconnect. Click **Manage connection → Rotate token** on the Jira card. This invalidates the current token and redirects you to re-authorize with a fresh Jira OAuth token. Project selections are preserved across rotation. |
| **Disconnect** | **Disconnect** removes the token entirely and clears the integration state. Reconnecting requires a full OAuth re-authorization. |

**Note:** Rotating a token via "Rotate token" is equivalent to disconnecting then immediately reconnecting — the organization integration record is preserved, only the stored credential is replaced. This means your Jira project selection is retained. A full **Disconnect** wipes all Jira integration metadata for the org and requires picking projects again after reconnecting.

### Public connect routes

For pre-account setup, there are public routes that an integration partner can share with their customers:

| Route | Purpose |
|---|---|
| `/connect/jira/[token]` | Jira Cloud OAuth — partner sets up Jira for a customer org |
| `/connect/github/[token]` | GitHub App installation — partner installs on customer account |
| `/connect/slack/[token]` | Slack workspace OAuth — partner adds Slack for a customer org |
| `/connect/done` | Post-oauth success landing |
| `/connect/error` | Post-oauth error with error codes |

**Partner token link use case:** AIDOS is deployed per-customer by an integration partner. The partner generates a `ConnectInvite` record (server-side) containing a single-use token scoped to a specific provider and organization. They share the resulting URL (e.g. `https://customer.aidos.live/connect/jira/[token]`) with the end customer's Jira admin — who clicks through and completes OAuth — without needing a pre-existing AIDOS account. Pages render outside the auth wall and are gated only by the token. Each token expires in 24 hours and can only be used once.

**Page banner:** Every partner token page displays a blue `Set up integration on behalf of customer` banner at the top so the visitor immediately understands they are acting as a partner代理, not a direct AIDOS user.

</input>
</invoke>
</minimax:tool_call>
---

## 7. Delivery DNA

**Route:** `/governance` (this URL serves the Delivery DNA page)  
**Sidebar icon:** the hexagon (no label)  
**Header:** "Delivery DNA"  
**H1:** "Delivery DNA"

The DNA is the org's profile. It drives recommendations and explains the org's posture.

### Screenshot — top
![Delivery DNA](screenshots/04-delivery-dna.webp)

### Screenshot — middle (Policy + Discovery)
![Delivery DNA mid](screenshots/04b-delivery-dna-mid.webp)

### Sections

- **Compliance monitoring** — open findings (continuous checks on AI code governance, ticket linkage, review coverage). For Connexus: 1 warning ("Large fully-AI commit").
- **Policy profile** — Workflow mode (Scaled agile), Approval depth (Director + compliance), Autonomy (Recommend-only), Risk threshold (64%), Compliance (NONE).
- **Discovery context** — Industry (Technology), Team size (11–50), SDLC maturity (3/5), DevOps maturity (3/5), Tools (github, jira), Workflows (scrum, devops).
- **Observability strategy** — guidance on what to connect before expanding autonomy.
- **Approval paths** — human escalation matrix by severity.

There are also links: **Governance policy**, **Workflow config**, **Re-run setup** (links to the Discovery wizard).

---

## 8. Delivery analysis

**Route:** `/delivery-analysis`  
**Header:** "Delivery analysis"  
**H1:** "Delivery analysis"

The deep-dive for delivery leads.

### Screenshot — top (KPIs)
![Delivery analysis](screenshots/07-delivery-analysis.webp)

### Screenshot — middle (signal board expanded)
![Delivery analysis expanded](screenshots/07c-delivery-analysis-expanded.webp)

### Screenshot — lower (charts, project, signals)
![Delivery analysis deeper](screenshots/07d-delivery-analysis-deeper.webp)

### Filters

- **Project** (combobox: All projects, CX, …)
- **Risk focus** (All risks, Blockers, Schedule, Quality, Sprint)
- **Range** (7 days, 30 days [default], 90 days)
- **Compare** (vs prior sync)

Actions: **Export**, **Sync now**.

### Top metrics

- Delivery health
- Open work
- Blocked
- Overdue
- Reopened
- Spillover

For Sprint 37 (CX): Blocked 30, Open work 38, Reopened 20, Spillover 22, Delivery health 0.

### Full signal board (expandable)

When you click "Full signal board", the page reveals:
- Risk mix (donut)
- Delivery health trend
- Project breakdown
- Active sprints (with cards)
- Delivery signals (extended list)

I did not exercise the export functionality, but the button is present.

---

## 9. Releases

**Route list:** `/releases`, `/releases/new`, `/releases/[id]`

### Releases list (`/releases`)

![Releases](screenshots/17-releases.webp)

Top-line KPIs: In flight · Awaiting approval · Blocked · Live in production.
Then a card per release (here: "Sprint 37 · STAGING · CX" — QA readiness 41%, governance risk —%, synced from Jira sprint).

### New release (`/releases/new`)

![Releases new](screenshots/17b-releases-new.webp)

Form to register a release. Fields I saw: Name, Sprint, Target environment (STAGING/PROD), Project.

### Release detail (`/releases/[id]`)

**THIS PAGE HAS A VISIBLE BUG.** The H1 shows the raw CUID id (`Cms640nhu001c4s0mnjw5esgw`) instead of the release name "Sprint 37". (See Q29.)

![Release detail](screenshots/30-release-detail.webp)

The page renders a 4-step pipeline:
1. **Release detected** (checkmark)
2. **Signals & assessment** (in-progress or complete)
3. **Human approval**
4. **Controlled deploy**

#### Before assessment
- "Not yet assessed" callout.
- Button: **Run governance & QA assessment**.

#### After assessment
![Release after assessment](screenshots/30c-release-after-assessment.webp)

- Verdict pill (e.g., **NO-GO**)
- **Release gate brief** with three numbers:
  - QA readiness (e.g., 0%)
  - Governance risk (e.g., 62%)
  - Risk level (e.g., HIGH)
- A short prose summary.
- **Top blockers** list (Quality, Sprint, etc.)
- **Signal details (13)** — collapsible list of every signal: schedule, CI, observability, etc. Each tagged `stability` / `coverage` / `regression` / `performance` / `governance`.
- **Source freshness** — Jira / GitHub / Grafana / Prometheus with their last-sync state.
- **1 pending approval · QA LEAD** banner linking to `/approvals`.
- **Regression intelligence** — short summary.

The signal details breakdown is the most interesting bit for QA. There are 13 signals here:

![Signal details](screenshots/30e-signal-details.webp)

Categories:
- **SCHEDULE (Jira)** — Onhold, Overdue, Open Bugs, Reopened, Spillover, QA pipeline, Assignee load, Active sprint
- **CI (GitHub)** — Regression suite, AI-assisted change
- **OTHER** — Critical path coverage, P95 latency, Error budget burn
- **OBSERVABILITY** — Not connected (placeholder when no Grafana/Prometheus)

---

## 10. Approvals

**Route:** `/approvals`  
**Header:** "Approval center"  
**H1:** "Approval center"

### Screenshot — empty state
![Approvals](screenshots/08-approvals.webp)

### Screenshot — with system events expanded
![Approvals system events](screenshots/08b-approvals-system-events.webp)

### Sections

- **Waiting on leadership** — count of items needing human sign-off. Empty for Connexus: *"No leadership actions right now. Releases can proceed without your sign-off."*
- **Pending approvals** — 0
- **Decision history** — "62 system events hidden" by default. Click **Show system events** to see the underlying audit log.
  - The expanded view shows events like: agent runs, system suggestions, recommendations. Each row has the timestamp, actor (system or human), action, and target.

### Ambiguity
"System events hidden by default" suggests the system has far more activity than the human sees. The toggle is the only way to surface it.

---

## 11. Governance surfaces

There are **four** sub-routes under `/governance`:

### `/governance/setup` — Discovery wizard
![Governance setup](screenshots/24-governance-setup.webp)

3 steps: Organization → Governance → Review. Pre-filled from your profile.

### Discovery step 2 (Governance)
![Discovery step 2](screenshots/24b-discovery-step2.webp)

Edits workflow mode, approval depth, autonomy, risk threshold.

### `/governance/policy`
![Governance policy](screenshots/25-governance-policy.webp)

A second view of the policy. **Ambiguity:** I could not tell if this is a separate edit surface or a read-only summary of what Discovery set.

### `/governance/workflow`
![Governance workflow](screenshots/26-governance-workflow.webp)

Edits per-workflow config. Lists workflows (Sprint tracking, Incident response, etc.) with risk and approval settings.

### `/governance/toolchain-mapping`
![Governance toolchain](screenshots/27-governance-toolchain.webp)
![Toolchain mid](screenshots/27b-toolchain-mid.webp)

Map tools (Jira, GitHub, Slack, …) to workflows. For example, "Jira → Sprint tracking", "GitHub → Engineering ops", "Slack → Incident response".

---

## 12. Investigate views

These are the four "deep-dive" pages reached from the dashboard's "Delegate the detail" cards or from the agents strip. Each has a similar structure: KPI cards, recent activity, and links back to source tools.

### QA — `/qa`
![QA](screenshots/10-qa.webp)

QA posture: 203 open bugs, 775 open issues, sprint bugs, test coverage metrics.

### DevOps — `/devops`
![DevOps](screenshots/11-devops.webp)
![DevOps mid](screenshots/11b-devops-mid.webp)

Cloud hygiene findings categorized by severity and service. AWS account ID `473220211695` is the focus.

### Productivity — `/productivity`
![Productivity](screenshots/12-productivity.webp)

Commit velocity, AI-assisted lines, top contributors, bus-factor. Highlights the top contributor (51.3%) and AI-assisted commit share.

### Code analysis — `/code-analysis`
![Code analysis](screenshots/13-code-analysis.webp)

Repository-level activity: commit frequency, files changed, AI-assisted commit share per repo.

### Code health — `/code-health`
![Code health](screenshots/14-code-health.webp)

Hotspot detection: identifies files with high change frequency and risk. For Connexus: `Connexus-inc/connexus-web-api` with risk score 10/10; `file-generator.service.ts` is the top hotspot.

---

## 13. Recommendations

**Route:** `/recommendations`  
**Header:** "Recommendations"

### Screenshot — top
![Recommendations](screenshots/09-recommendations.webp)

### Screenshot — middle
![Recommendations mid](screenshots/09b-recommendations-mid.webp)

A list of prioritized recommendations, each with:
- A title (e.g., "Triage the 9 in-sprint bugs before expanding scope")
- A rationale (3–5 lines)
- "Source: Sprint 37" attribution
- Confidence score
- Action buttons (Approve, Defer, Dismiss)

This is the *system-wide* view; the dashboard shows the most relevant few. Each card has a direct "Open in source tool" link.

---

## 14. Ask AIDOS

**Route:** `/agent-threads` (list) and `/agent-threads/new` (compose) and `/agent-threads/[id]` (conversation)

This is the conversational AI surface. It looks like a chat app with:
- A left rail listing all threads
- A right pane with the active conversation
- 4 suggested prompts above the input box
- A text input ("Ask AIDOS anything about your delivery operations…") and a Send button

### Screenshot — list view
![Agent threads](screenshots/15-agent-threads.webp)

### Screenshot — new thread (suggested prompts)
![Agent thread new](screenshots/29-agent-thread-new.webp)

### Screenshot — open thread (conversational)
![Agent thread detail](screenshots/29b-agent-thread-detail.webp)

### What I observed

- Threads persist across sessions and across pages.
- Some threads are prefixed with `@U0BMN9YBNTV` (a Slack user ID) — suggesting Slack origin. (Q44.)
- The AI answers are rich and reference real numbers from the org's data (e.g., "I'll check the latest QA analysis to give you an accurate picture… Here's where Connexus stands: …").
- The 4 suggested prompts: "What open bugs are in this sprint?", "What did the QA agent find?", "Any high-severity AWS findings?", "How ready is our latest release?" — these are the four high-value entry points.

### Ambiguity
No obvious feedback mechanism (thumbs up/down) on AI answers. (Q47.)

---

## 15. Incidents

**Route:** `/incidents` (list) and `/incidents/[id]` (detail)

### Screenshot — list
![Incidents](screenshots/16-incidents.webp)

A short list (1 open for Connexus) of production incidents. The "Elevated risk detected for Sprint 37" incident was created automatically when I ran the release assessment. (Q48.)

### Screenshot — detail
![Incident detail](screenshots/31-incident-detail.webp)
![Incident detail lower](screenshots/31b-incident-detail-lower.webp)

Sections:
- **Description** — generated from the release assessment.
- **Correlation** — links to the linked release (Sprint 37).
- **Likely related changes** — pulls PRs in a 72h window before the incident.
- **Remediation** — Status dropdown (Open shown) and a notes textarea. "Update incident" button.

---

## 16. Supporting pages

### Workflow — `/workflow`
![Workflow](screenshots/19-workflow.webp)

A central "workflows in this org" page. Lists active workflows, their owners, and link to the governance/workflow config.

### Audit — `/audit`
![Audit](screenshots/21-audit.webp)

Append-only event log: who did what, when. For Connexus it shows recent activity (integrations, sign-ins, agent runs).

### Settings — `/settings`
![Settings](screenshots/22-settings.webp)

Tabs: Members, Integrations, Workspace, etc. Member invites, plan tier, workspace settings.

### Observability — `/observability`
![Observability](screenshots/18-observability.webp)

**Note:** Visiting this URL on Connexus redirects to `/integrations` (Connect page). I am not sure if Observability is meant to be a separate product surface for ENTERPRISE orgs, or if it is in roadmap. (Q57.)

### Reports — `/reports`
![Reports](screenshots/20-reports.webp)

Redirects to `/dashboard`. (Q58.)

### Admin — `/admin`
![Admin](screenshots/23-admin.webp)

Redirects to `/dashboard` for this account. Likely a different role. (Q5.)

### Activate — `/activate`
![Activate](screenshots/28-activate.webp)

Redirects to `/dashboard`. Probably an onboarding-completion page that is dismissed for already-onboarded orgs.

---

## 17. Glossary

- **Delivery DNA** — the org's profile (industry, team size, maturity, policy) that drives AIDOS recommendations.
- **Delivery confidence** — composite 0–100 score; the 5-axis breakdown.
- **Governance score** — a 0–100 score derived from the DNA's policy (autonomy, approval depth, risk threshold, compliance).
- **Risk threshold** — the % at or above which a release needs human approval (Connexus: 64%).
- **Autonomy** — `Recommend-only` (AI suggests, human decides) or higher tiers.
- **Workspace mode** — `ENTERPRISE` (current) or the accelerator-friendly mode. ENTERPRISE hides the MVP Accelerator wedge.
- **Signals** — individual data points the system pulls from integrations; grouped into schedule, CI, observability, other.
- **NO-GO** — release verdict from the assessment when governance risk is above threshold.
- **Source freshness** — the age of the data for each integration (e.g., "Jira · 8h ago").
- **CUID** — the long ids you see in URLs (e.g., `cms640nhu001c4s0mnjw5esgw`). They are cuid2 ids, not human-readable.
- **Early warning** — forward-looking prediction; has a confidence % and a horizon (short, medium, long).
- **Bus factor** — concentration of commits in one contributor (Connexus: 51.3% on one person).

---

## 18. Ambiguities

These are the things I found unclear while walking the app. The full list of 70 questions is in `QUESTIONS-FOR-PO.md`. Top 5 here:

1. **Score `0` vs `39`** — the dashboard says "Delivery confidence 39 / 100" but every axis card says `0`. Which is "right"? Likely the 39 is a derived composite and 0s are unfilled placeholders. This is a visual bug.
2. **H1 on release detail is a CUID** — `Cms640nhu001c4s0mnjw5esgw` instead of "Sprint 37". A clear defect.
3. **Phase 1 pill everywhere** — unclear if this is a roadmap indicator or a build badge.
4. **Sidebar hexagon has no label** — looks like a Delivery DNA entry but is unlabelled.
5. **Multiple "setup" surfaces** — `/governance`, `/governance/setup`, `/governance/policy`, `/governance/workflow`, `/governance/toolchain-mapping` — overlap with each other and with the Discovery wizard. The source of truth is unclear.

See `QUESTIONS-FOR-PO.md` for the full 70.

---

## 19. Screenshots

All screenshots are in `./screenshots/`. Naming: `NN-section[-modifier].webp`.

| # | File | What it shows |
|---|---|---|
| 01 | `01-login.webp` | Login screen |
| 02 | `02-dashboard-today.webp` | Dashboard top |
| 02b | `02b-dashboard-bottom.webp` | Dashboard scrolled to bottom (same as top, body fixed) |
| 02c | `02c-dashboard-mid1.webp` | What needs attention + Early warnings |
| 02d | `02d-dashboard-mid2.webp` | 5-axis Delivery confidence |
| 02e | `02e-dashboard-mid3.webp` | Waiting on leadership + Delegate the detail |
| 03 | `03-integrations.webp` | Connect page top |
| 03b | `03b-integrations-mid1.webp` | GitHub repos + Jira setup |
| 03c | `03c-integrations-mid2.webp` | Jira + Slack |
| 03d | `03d-integrations-mid3.webp` | Grafana, Prometheus, AWS |
| 03e | `03e-integrations-mid4.webp` | Connect page bottom |
| 04 | `04-delivery-dna.webp` | Delivery DNA top |
| 04b | `04b-delivery-dna-mid.webp` | DNA policy + discovery context |
| 05 | `05-discovery.webp` | Discovery wizard step 1 (captured before redirect detected) |
| 06 | `06-governance.webp` | /governance landing (renders DNA — same as 04) |
| 07 | `07-delivery-analysis.webp` | Delivery analysis KPIs |
| 07b | `07b-delivery-analysis-mid.webp` | Delivery analysis grid |
| 07c | `07c-delivery-analysis-expanded.webp` | Full signal board expanded |
| 07d | `07d-delivery-analysis-deeper.webp` | Charts, project breakdown, sprints |
| 08 | `08-approvals.webp` | Approvals empty state |
| 08b | `08b-approvals-system-events.webp` | Approvals with system events |
| 09 | `09-recommendations.webp` | Recommendations top |
| 09b | `09b-recommendations-mid.webp` | Recommendations mid |
| 10 | `10-qa.webp` | QA page |
| 11 | `11-devops.webp` | DevOps top |
| 11b | `11b-devops-mid.webp` | DevOps mid |
| 12 | `12-productivity.webp` | Productivity |
| 13 | `13-code-analysis.webp` | Code analysis |
| 14 | `14-code-health.webp` | Code health |
| 15 | `15-agent-threads.webp` | Agent threads list |
| 16 | `16-incidents.webp` | Incidents list |
| 17 | `17-releases.webp` | Releases list |
| 17b | `17b-releases-new.webp` | New release form |
| 18 | `18-observability.webp` | /observability (redirected) |
| 19 | `19-workflow.webp` | Workflow center |
| 20 | `20-reports.webp` | /reports (redirected) |
| 21 | `21-audit.webp` | Audit log |
| 22 | `22-settings.webp` | Settings |
| 23 | `23-admin.webp` | /admin (redirected) |
| 24 | `24-governance-setup.webp` | Discovery wizard step 1 |
| 24b | `24b-discovery-step2.webp` | Discovery step 2 (Governance) |
| 25 | `25-governance-policy.webp` | /governance/policy |
| 26 | `26-governance-workflow.webp` | /governance/workflow |
| 27 | `27-governance-toolchain.webp` | Toolchain mapping top |
| 27b | `27b-toolchain-mid.webp` | Toolchain mapping mid |
| 28 | `28-activate.webp` | /activate (redirected) |
| 29 | `29-agent-thread-new.webp` | Ask AIDOS new thread (suggested prompts) |
| 29b | `29b-agent-thread-detail.webp` | Open agent thread conversation |
| 30 | `30-release-detail.webp` | Release detail (CUID H1 bug) |
| 30b | `30b-release-detail-lower.webp` | Same view scrolled (page is short) |
| 30c | `30c-release-after-assessment.webp` | Release after running assessment |
| 30d | `30d-release-assessment-mid.webp` | Release assessment mid |
| 30e | `30e-signal-details.webp` | Release 13 signal details expanded |
| 30f | `30f-release-bottom.webp` | Release regression intelligence footer |
| 31 | `31-incident-detail.webp` | Incident detail top |
| 31b | `31b-incident-detail-lower.webp` | Incident remediation form |

---

## Reading order for the next QA

1. Read `TRACKER.md` (one-page summary of where this work came from).
2. Read Sections 1–4 of this guide.
3. Walk the app in this order: Login → Dashboard → Integrations → Delivery DNA → Delivery analysis → Releases → Approvals → Recommendations → Ask AIDOS → Incidents.
4. Then read `QUESTIONS-FOR-PO.md` and prioritize Q1, Q2, Q4, Q5, Q10, Q29, Q31, Q62, Q63 for your first sync with the PO.

---

## 20. Interaction drive — 2026-08-11

> Second pass: drove real actions through the UI instead of just walking. Findings here are QA-defect-grade, not documentation gaps.
>
> Source of truth: `FINDINGS-LOG.md` (entries D-01 … D-31). Screenshots: `screenshots/IA-*.png`.
>
> **Findings summary by severity:**
>
> | # | Severity | Title |
> |---|---|---|
> | D-04 | high | Discovery Industry dropdown (Finance) does not persist in Review summary |
> | D-10 | high | Jira sync surfaces raw `errorMessages`/`errors` JSON to user |
> | D-20 | medium | Release page banner uses raw CUID instead of release name |
> | D-25 | high | Native `<select>` in AIDOS is not bound to React state — automation needs DOM workaround |
> | D-27 | medium | Recommendation cards have no Approve / Defer / Dismiss actions |
> | D-18 | medium | "Invalid release data" error has zero field-level feedback |
>
> **Patterns discovered:**
>
> - **Connectors:** Grafana, Prometheus wizards expand inline (no modal). AWS is pre-connected with stale "initial sync pending" state. Jenkins is "Coming soon" but the banner still says "Jenkins · 3 disconnected" — number mismatch.
> - **Releases:** Form rejects unknown branches with a generic "Invalid release data". Setting `branch = main` (the configured production branch from toolchain mapping) succeeds. New release auto-creates a pending approval.
> - **Ask AIDOS:** When asked for the "most recent release", the agent picked Sprint 37 (older) instead of the release I had just created. Recency sort is broken.
> - **Incidents:** Status select is a native `<select>` and `tab.select` does not bind to React state. Workaround: `evaluate(s.value = '...'; s.dispatchEvent(new Event('change', {bubbles:true})))`. No toast on update — silent success.
> - **Audit log:** Comprehensive, chronological, 50 events visible. Filter buttons work. **No defects found.**
> - **Settings:** Team invite generates a share link with `name=local-part-of-email` (cosmetic). No autonomy-mode toggle in Phase 1.
>
> **Critical automation note for next QA / engineer:** every native `<select>` in AIDOS (Incident, Connect auth dropdown, Release env, Discovery steps, etc.) requires the evaluate+dispatch workaround. The standard `page.select()` fails silently. The native DOM event channel is unbound from React.

5. File defects for Q10 (score display), Q29 (CUID H1), Q65 (missing sidebar label), D-04, D-10, D-18, D-20, D-25, D-27 and any others you can reproduce.


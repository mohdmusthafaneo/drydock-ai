# Stakeholder Meeting — Minutes & Feedback Analysis

**Date:** 2026-06-25
**Type:** Stakeholder feedback review (Minutes of Meeting)
**Purpose:** Capture stakeholder feedback, compare it against what AIDOS does today, and frame each item for the AIDOS team to turn into a development plan, technical assessment, and architecture decisions.
**Audience:** Solution architects, engineering leads, business/product heads (≈30-minute read).

---

## 1. How to read this document

Each feedback point below follows the same shape so it can be triaged quickly:

- **What the stakeholders want** — the intent in plain language.
- **What AIDOS has today** — the honest current state from the codebase.
- **The gap** — the delta we have to build.
- **Direction** — a first-cut technical approach (to be refined by the team).
- **Build size** — rough order of magnitude: **S** (extend existing), **M** (new subsystem on existing data), **L** (new engine / agent / data source).

> **Context for non-technical readers:** AIDOS is a **governance and operational intelligence layer** on top of GitHub, Jira, Grafana/Prometheus, etc. It does not write code. It observes delivery signals and tells leadership what is risky, what needs approval, and what to trust. Today it is mostly **descriptive and rule-based**. Most of the feedback below pushes AIDOS toward being **calibrated, customizable, and predictive** — and toward making **AI-generated code risk** a first-class concern.

---

## 2. One-paragraph summary

The stakeholders validated the core direction but pushed on a clear theme: **AIDOS must move from "a dashboard that reflects data" to "an intelligent system that calibrates to each project, watches continuously, and warns before things break."** The strongest recurring concern is **trust in the underlying data** — both AI-generated code (is it junk? who owns it? is it risky?) and Jira hygiene (if the board is mismanaged, our scores are wrong). Four of the ten points (AI code risk, Jira misgovernance, calibration onboarding, and the problem predictor) are about earning that trust before AIDOS is allowed to make confident claims to senior management.

---

## 3. Themes (grouping of the 10 points)


| Theme                              | Points  | What it means                                                                   |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------- |
| **AI code accountability & risk**  | 1, 7    | Tie AI-generated code to tickets, score its risk, and know who is accountable.  |
| **Compliance & governance engine** | 2, 3, 4 | Customizable, continuously-monitored compliance run by a background agent.      |
| **Data trust & calibration**       | 5, 9    | Detect Jira mismanagement; calibrate analytics to each project's real workflow. |
| **Delivery risk signals**          | 6       | Spillover, delayed, and reopened tickets as planning-quality indicators.        |
| **From descriptive to predictive** | 8, 10   | Predict problems before they occur; auto-generate narrative summaries.          |


---

## 4. Feedback items

### Point 1 — AI-generated code risk on the dashboard

**What the stakeholders want**
Surface AI-generated code risk on the dashboard by:

1. Connecting GitHub commit data,
2. Extracting the feature context and finding the relevant Jira ticket,
3. Comparing the code against the ticket description to produce a **completion score**,
4. Assessing "AI junk" and producing a **risk confidence** for introducing that code into the system.

**What AIDOS has today**

- A working **code-analysis pipeline** (`src/lib/code-analysis/`): syncs commits + merged PRs from GitHub, classifies each as `human_only` / `ai_assisted` / `ai_generated` with a confidence score.
- Classification is **regex/heuristic-based** (`classifier.ts`): co-author trailers (Copilot/Cursor), tool footers, bulk-add line patterns, PR-body keywords.
- KPIs already exist: % AI lines, % AI commits, % AI PRs, **review coverage on AI PRs**, plus per-author and per-repo breakdowns and basic `governanceSignals`.

**The gap**

- **No commit → Jira ticket linkage.** Code analysis never reads a Jira issue key; there is no join between commits/PRs and tickets.
- **No completion score** (code vs. ticket description) — this requires LLM reasoning over both artifacts.
- **No code-quality / "AI junk" assessment** — current logic only detects *whether* code is AI-made, not *how good or risky* it is.
- **No introduction-risk confidence** derived from reviewing the actual diff.

**Direction**

1. Extract Jira keys from branch names, commit messages, and PR titles/bodies; persist a commit↔ticket link (extend `CodeAnalysisCommit`/`PullRequest`).
2. Add an LLM scoring step: ticket description + diff → completion score + risk rationale.
3. Add a code-quality signal layer (complexity, test coverage delta, churn, review depth) feeding a composite **AI-code risk score**.
4. Surface a dashboard claim card: "X% of this release is AI-generated, N high-risk areas, M unreviewed."

**Build size:** **L** (new linkage data + LLM scoring engine on top of existing pipeline).

---

### Point 2 — Continuous compliance monitoring

**What the stakeholders want**
The system continuously monitors **new and existing code** and checks it against the **compliance rules set for the project**.

**What AIDOS has today**

- `GovernancePolicy` per org (deployment thresholds, release rules, approval requirements, escalation chains — stored as JSON).
- `complianceType` captured during discovery and reflected in Delivery DNA / governance presentation.
- **No compliance rule engine** and **no continuous code-compliance scanning.** Compliance today is a *posture/profile*, not an enforced, evaluated ruleset.

**The gap**

- A formal, evaluable **compliance rule model** (rule → scope → check → severity).
- A **continuous evaluation loop** over the codebase (new commits and the existing baseline), not a one-time sync.
- Compliance findings surfaced as signals/violations with status and ownership.

**Direction**

1. Introduce a `ComplianceRule` + `ComplianceFinding` data model (scoped by `organizationId`, then by project).
2. Evaluate on each sync/webhook for new code, plus a periodic full-baseline pass for existing code.
3. Feed findings into the governance signals + dashboard verdicts.

**Build size:** **L** (new subsystem). Tightly coupled to Points 3 and 4.

---

### Point 3 — Customizable compliance & governance per project

**What the stakeholders want**
The **entire compliance and governance system must be customizable per project**, because every project has different compliance and governance needs.

**What AIDOS has today**

- Org-level customization exists: `OrganizationProfile`, `DeliveryDNA`, and `GovernancePolicy` are all per-organization and JSON-driven.
- `ToolchainMapping` already supports **per-project overrides** (`projectOverrides`) for Jira semantics — a useful precedent.
- **No per-project compliance/governance rulesets.** Governance is currently modeled at the **org** level, not the **project** level.

**The gap**

- Move governance/compliance from org-scoped to **project-scoped (with org defaults)**.
- A way to **define, edit, and version** rulesets per project (UI + storage).
- Resolution logic: project ruleset → org default → system default.

**Direction**

1. Reuse the `projectOverrides` pattern: org baseline + project-level compliance/governance configuration.
2. Store rulesets as structured config (JSON/YAML) with a clear schema and an editor in the governance UI.
3. All scoring/signals read the **resolved** ruleset for the project in scope.

**Build size:** **M** (extends existing per-org governance with a project layer; foundation already partly present).

---

### Point 4 — Background compliance-check agent

**What the stakeholders want**
For Points 2 and 3, an **AI agent runs in the background** continuously checking the codebase for compliance.

**What AIDOS has today**

- A real **agent runtime foundation**: `AgentRegistry` (with a `GOVERNANCE` agent type), `AgentWakeupRequest`, `AgentHeartbeatRun`, and a Mastra-based heartbeat workflow (`src/mastra/workflows/heartbeat.ts`) that wakes agents on timer/event/approval/on-demand triggers.
- Agent chat + control-plane infrastructure already exists.
- **No compliance-specific agent logic** wired to the codebase yet.

**The gap**

- A dedicated **Compliance agent** definition: tools to read the resolved ruleset (Point 3), evaluate code (Point 2), and write findings.
- Scheduling: timer-based full passes + event-based incremental checks on new commits/PRs.
- Human-in-the-loop: findings escalate to recommendations/approvals per existing governance loop.

**Direction**

1. Define the compliance agent on top of the existing heartbeat/wakeup machinery.
2. Give it tools for: fetch ruleset, fetch code changes, run checks, persist `ComplianceFinding`, raise recommendations.
3. Keep it **recommend-only** (consistent with current autonomy model).

**Build size:** **M** (runtime exists; the agent's tools + logic are the new work). Depends on Points 2 and 3.

---

### Point 5 — Jira misgovernance warning

**What the stakeholders want**
AIDOS depends on Jira for most flags, signals, and scores. If a project doesn't maintain Jira properly, AIDOS shows inaccurate data. We already ask for the Jira setup via the workflow, but PMs/scrum masters may still not use it correctly. **Warn AIDOS users (senior management) when the Jira board is not maintained according to the configured workflow.**

**What AIDOS has today**

- Strong Jira ingestion + analysis: `jira-introspection`, `jira-delivery-health`, `toolchain-mapping`.
- Some **data-quality gaps** are already detected: stale sync (>48h), release-not-matched-to-fix-version (traceability), version slip.
- **No dedicated "Jira hygiene / misgovernance" assessment** that compares actual board usage against the configured workflow and warns leadership.

**The gap**

- A **hygiene scoring layer**: e.g., issues missing estimates, missing due dates, unassigned work, statuses not in the configured workflow, fix versions not used, stale tickets, no sprint discipline.
- An explicit **"data may be unreliable"** warning surfaced to management (degrades confidence in all Jira-derived scores).

**Direction**

1. Compute a **Jira hygiene score** per project from the snapshot vs. the confirmed `ToolchainMapping` workflow.
2. When hygiene is poor, gate or visibly discount Jira-derived verdicts (tie into the existing "Data confidence" briefing claim).
3. Show a leadership-facing warning: "Project X's Jira is not maintained per the agreed workflow — these numbers may be unreliable."

**Build size:** **M** (new scoring on existing Jira snapshot + toolchain mapping). High value, moderate effort.

---

### Point 6 — Spillover / delayed / reopened indicators

**What the stakeholders want**
Delivery managers / heads of product judge whether a release/sprint is progressing well using: **spillover** tickets (carried from prior sprints), **delayed** tickets (past due date), and **reopened** bugs/tickets. These indicate poor sprint/release planning that affects delivery. AIDOS should handle these.

**What AIDOS has today**

- **Delayed: partially covered.** Overdue (past due date) is tracked at portfolio, project, and version level and feeds signals/gaps.
- **Spillover: not tracked.** No notion of tickets carried over between sprints.
- **Reopened: not tracked.** No reopen-transition history is ingested. (The only "reopen" in the codebase is for agent chat threads, unrelated.)

**The gap**

- Ingest **sprint membership history** to detect spillover (issue present in multiple sprints).
- Ingest **status change history / changelog** to detect reopened issues (Done → reopened transitions).
- Add these as first-class delivery signals + KPIs.

**Direction**

1. Extend the Jira sync to pull issue changelog / sprint history (where the API allows).
2. Add `spilloverCount` and `reopenedCount` to the delivery snapshot and signals.
3. Present as planning-quality indicators on `/delivery-analysis` and as a release verdict input.

**Build size:** **M** (depends on pulling additional Jira history; analytics are then straightforward).

---

### Point 7 — Accountability & cost of maintaining code

**What the stakeholders want**
Heavy use of AI coding tools introduces a large volume of code and an **accountability problem**. AIDOS should identify these risk areas and show **who is accountable** for given code (committer, reviewer, etc.). If an issue later arises on specific lines — or AIDOS/we identify that AI-generated code introduced the risk — we should be able to **identify who is accountable**.

**What AIDOS has today**

- `CodeAnalysisCommit` stores author + attribution; `CodeAnalysisPullRequest` stores author + **review count**. So committer and reviewer presence is partially captured.
- Per-author AI-line breakdowns exist.
- **No accountability ledger:** no file/line-level ownership, no reviewer identity (only counts), no link from a future incident back to the responsible code/people, **no cost-of-maintenance metric.**

**The gap**

- A **code accountability model**: who committed, who reviewed, AI vs. human, risk level — at file (and ideally line/area) granularity.
- A **traceability path** from an incident/issue → the implicated code → the accountable people.
- A **maintenance-cost signal** (e.g., churn, rework, bug density on AI-heavy areas).

**Direction**

1. Capture reviewer identities and ownership at file level (extend code-analysis ingest).
2. Build an "accountability view": high-risk AI areas + responsible committer/reviewer.
3. Link to incidents (the `Incident` model already exists) so post-incident attribution is possible.

**Build size:** **L** (richer ingestion + new accountability/cost model). Strongly related to Point 1.

---

### Point 8 — Problem predictor

**What the stakeholders want**
AIDOS should not be "just a dashboard that shows data." The agentic system should **continuously monitor all data points and predict problems before they occur** — across code, delivery, QA, DevOps, compliance/governance, and observability. With many connected data sources, AIDOS should become a **problem predictor** using intelligent algorithms and agents.

**What AIDOS has today**

- Rich **descriptive/reactive** intelligence: delivery health, QA intelligence, DevOps intelligence, observability analysis, incident detection, release readiness/risk scoring.
- Agent runtime + heartbeat infrastructure capable of running continuous background analysis.
- **No predictive/forecasting layer** — no leading-indicator detection, trend extrapolation, or anomaly/early-warning models. Current scores describe the present, not forecast the future.

**The gap**

- A **prediction layer** that consumes the existing signals (delivery, code, QA, DevOps, observability) and emits forward-looking risk alerts ("this release is trending toward a slip", "incident likelihood rising").
- Cross-domain correlation and an early-warning surface on the dashboard.

**Direction**

1. Start with **trend + threshold-based leading indicators** (achievable now from existing snapshots/history tables, e.g., `DeliveryAnalysisSnapshot`, telemetry trends).
2. Add an orchestrating "prediction" agent that periodically correlates domains and raises predicted-problem recommendations.
3. Evolve toward statistical/ML forecasting as data history accumulates.

**Build size:** **L** (new capability and the platform's biggest differentiator). Best delivered incrementally — heuristics first, models later.

---

### Point 9 — Onboarding Jira calibration with last 90 days of data

**What the stakeholders want**
When a project connects to AIDOS, naive analysis can wrongly flag the project as risky/bad-shape, making users distrust AIDOS. Instead, after the Jira connection is ready, run a **calibration step**:

1. Pull the **last 90 days** of Jira data,
2. Match it against the configured Jira workflow setup,
3. Detect **custom flows** the team legitimately uses (instead of assuming a fixed workflow),
4. **Calibrate** the delivery analytics to that custom workflow, using **LLM reasoning** to derive a workflow model,
5. Store it (JSON/YAML/custom — whatever fits) and apply it whenever showing any Jira-based data, scores, or signals.

**What AIDOS has today**

- A strong foundation: `ToolchainMapping` already **infers** methodology, blocked status, bug issue type, and release tracking from the first Jira sync + discovery, with schema-based suggestions and a confirmation step (`toolchainMappingConfirmedAt`).
- `90d` is already a supported analysis range.
- **No 90-day historical calibration pass** and **no LLM-derived workflow model.** Current inference is heuristic/schema-based and largely point-in-time, not learned from 90 days of real behavior.

**The gap**

- A dedicated **calibration workflow** triggered after Jira connects: fetch 90 days, analyze real status transitions/usage, detect deviations from the configured workflow, and use LLM reasoning to produce a calibrated workflow model.
- Persist that model and make **all** Jira-derived analytics read from it.
- This directly de-risks Point 5 (hygiene warnings should respect legitimately-custom flows).

**Direction**

1. Add a calibration step to onboarding that runs once the Jira snapshot is available.
2. Produce a stored "calibrated workflow profile" (extend `ToolchainMapping` or a new model).
3. Gate delivery scores until calibration completes (prevents the "AIDOS is wrong" first impression).

**Build size:** **L** (new onboarding workflow + LLM calibration + history pull). High strategic value — it underpins trust in Points 5 and 6.

---

### Point 10 — AI-generated dashboard headlines

**What the stakeholders want**
Instead of fixed-template dashboard summaries, an **LLM workflow runs periodically** (e.g., every 1–3 hours), generates the summary as text, and stores it in the database. The dashboard simply displays the stored text — giving users a better understanding than templated copy.

**What AIDOS has today**

- A polished **deterministic** executive briefing engine (`compose-briefing.ts`) producing headline + claim cards + health gauge.
- The briefing type **already anticipates this**: `source: "deterministic" | "llm_enriched"`, and an `assessmentSummary` field exists.
- An `llm-text` Mastra workflow exists as a building block.
- **No periodic LLM generation** and **no storage** of generated summaries yet.

**The gap**

- A scheduled job/agent that periodically generates the narrative via LLM and **persists** it.
- Dashboard reads the stored summary (with the deterministic version as fallback).

**Direction**

1. Add a periodic workflow (reuse heartbeat scheduling) that composes structured facts → LLM → stored summary.
2. Persist generated summaries (new field/model) with a freshness timestamp and interval config.
3. Render stored text on the dashboard; fall back to deterministic briefing when none/stale.

**Build size:** **S–M** (most building blocks exist: deterministic facts, `source` field, LLM workflow, scheduler). Lowest-effort, quick win.

---

## 5. Current-state vs. requested-state at a glance


| #   | Feedback                                              | Current state                                                        | Gap size |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| 1   | AI code risk (ticket link + completion + junk + risk) | AI attribution only (regex), no ticket link, no quality/risk scoring | **L**    |
| 2   | Continuous compliance monitoring                      | Governance posture only; no rule engine or continuous checks         | **L**    |
| 3   | Customizable compliance/governance per project        | Org-level + Jira per-project overrides precedent                     | **M**    |
| 4   | Background compliance agent                           | Agent runtime + heartbeat exists; no compliance agent                | **M**    |
| 5   | Jira misgovernance warning                            | Some data-quality gaps; no hygiene score/warning                     | **M**    |
| 6   | Spillover / delayed / reopened                        | Delayed partial; spillover & reopened absent                         | **M**    |
| 7   | Accountability & maintenance cost                     | Author/review counts only; no ownership ledger or cost metric        | **L**    |
| 8   | Problem predictor                                     | Descriptive only; no forecasting/early-warning                       | **L**    |
| 9   | 90-day Jira calibration onboarding                    | Heuristic toolchain inference; no 90d LLM calibration                | **L**    |
| 10  | AI-generated dashboard headlines                      | Deterministic briefing; `source` field ready, not generated/stored   | **S–M**  |


---

## 6. Dependencies & sequencing (proposed for discussion)

```
Point 9 (90-day calibration)  ──► underpins ──►  Point 5 (Jira hygiene warning)
                                              └─►  Point 6 (spillover/delayed/reopened accuracy)

Point 3 (per-project rulesets) ──► required by ──► Point 2 (continuous compliance)
                                                └─► Point 4 (compliance agent runs the checks)

Point 1 (AI code risk) ── shares data with ── Point 7 (accountability & cost)

Point 8 (problem predictor) ── consumes signals from ── Points 1, 5, 6 and all existing intelligence
Point 10 (AI headlines)     ── consumes outputs of  ── everything above (presentation layer)
```

**Suggested order of conversation:**

1. **Foundational trust:** Point 9 (calibration) → Point 5 (hygiene). Without trustworthy Jira data, every score is suspect.
2. **Compliance stack:** Point 3 → Point 2 → Point 4 (build the rule model, then the engine, then the agent).
3. **AI code stack:** Point 1 → Point 7 (ticket linkage + risk first, then accountability/cost on the same data).
4. **Delivery signals:** Point 6 (alongside calibration work since both touch Jira history).
5. **Intelligence & presentation:** Point 8 (predictor) and Point 10 (AI headlines) — Point 10 is a fast standalone win.

---

## 7. Cross-cutting architecture questions for the team

These should be resolved before detailed estimates:

1. **Scope model:** Are we formally moving governance/compliance from **org-scoped** to **project-scoped**? (Affects schema, RBAC, UI, tenancy.)
2. **Compliance rule representation:** JSON vs. YAML vs. policy-as-code; who authors rules; how are they versioned and audited?
3. **LLM usage & cost:** Points 1, 8, 9, 10 all add LLM calls. BYOK vs. managed keys, rate limits, caching, and cost ceilings per org.
4. **Jira history depth:** Can we reliably pull changelog/sprint history (cloud API limits, large boards) for spillover/reopened and 90-day calibration?
5. **Agent autonomy:** Compliance and predictor agents stay **recommend-only** (consistent with current model) — confirmed?
6. **Data trust gating:** Should low Jira-hygiene or pre-calibration states **hide/discount** scores rather than show potentially-wrong numbers? (Recommended.)
7. **Accountability & privacy:** Surfacing individual accountability (committer/reviewer) has people-management implications — what is shown, to whom, and with what framing?

---

## 8. Recommended next steps

1. **AIDOS team review** of this document; confirm intent per point and correct any current-state misreadings.
2. **Decide the scope model** (Question 1) — it blocks Points 2, 3, 4.
3. **Spike two foundations:** (a) Jira changelog/90-day pull feasibility (Points 6 + 9); (b) commit↔Jira-ticket linkage (Point 1).
4. **Ship the quick win:** Point 10 (LLM dashboard headlines) to demonstrate momentum while larger items are scoped.
5. **Produce technical assessments** per theme (AI-code stack, compliance stack, calibration/trust, predictor) feeding into the next development plan and architecture docs.

---

*Prepared as minutes of the stakeholder meeting and as input for the AIDOS development plan, technical assessments, and architecture planning. Current-state assessments are drawn from the existing codebase (schema, code-analysis, delivery-analysis, toolchain-mapping, executive-briefing, and agent runtime).*
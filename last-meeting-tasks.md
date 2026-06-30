# Last meeting tasks

**Meeting:** 2026-06-25 stakeholder feedback  
**Source:** [STAKEHOLDER-MEETING-MINUTES.md](./STAKEHOLDER-MEETING-MINUTES.md)  
**Last updated:** 2026-06-30 (Point 4 shipped)


| #   | Point                                            | Size | Status      | Notes                                                                             |
| --- | ------------------------------------------------ | ---- | ----------- | --------------------------------------------------------------------------------- |
| 1   | AI-generated code risk on the dashboard          | L    | **Done**    | 1a–1d shipped: Jira linkage, LLM completion score, composite risk, dashboard + executive claim |
| 2   | Continuous compliance monitoring                 | L    | **Done**    | 2a–2d: `ComplianceFinding` + seeded rule catalog; eval on sync/enrich + cron baseline; `/governance` panel + executive claim |
| 3   | Customizable compliance & governance per project | M    | Done        | Project-scoped rulesets                                                           |
| 4   | Background compliance-check agent                | M    | **Done**    | 4a–4d: findings on `/code-analysis`; `aidos_list_compliance_findings`; critical → recommendation + approval; eval wakeup |
| 5   | Jira misgovernance warning                       | M    | Done        | Hygiene score + leadership warning                                                |
| 6   | Spillover / delayed / reopened indicators        | M    | Done        | Overdue shipped; spillover + reopened via JQL sync, signals, delivery-analysis UI |
| 7   | Accountability & cost of maintaining code        | L    | **Done**    | 7a–7d shipped: named reviewers, file ownership + maintenance cost, incident↔code links, accountability card + executive claim |
| 8   | Problem predictor                                | L    | Not started | Forward-looking risk alerts                                                       |
| 9   | Onboarding Jira calibration (90 days)            | L    | Not started | LLM workflow model from history                                                   |
| 10  | AI-generated dashboard headlines                 | S–M  | Done        | Cron enrich + snapshot + deterministic fallback                                   |


## Development order (Point 1 first)

Chosen path: ship **Point 1 in slices** (linkage → scoring → dashboard), then the remaining open items in dependency order.

| Order | ID    | Work item                                              | Size | Depends on | Status      |
| ----- | ----- | ------------------------------------------------------ | ---- | ---------- | ----------- |
| 1     | **1a** | **Commit → Jira ticket linkage** — extract keys from branch/commit/PR; persist on `CodeAnalysisCommit` / `CodeAnalysisPullRequest`; show in code-analysis UI | S–M  | —          | **Done**    |
| 2     | **1b** | **Completion score** — LLM: ticket description + diff → score + rationale | M    | 1a, Jira   | **Done**    |
| 3     | **1c** | **AI junk & risk signals** — quality heuristics (complexity, churn, review depth, test delta) → composite AI-code risk score | M    | 1a         | **Done**    |
| 4     | **1d** | **Dashboard surface** — AI risk card on Code Analysis + always-on executive claim on `/dashboard` | S–M  | 1b, 1c     | **Done**    |
| 5     | **7a** | **Reviewer identity** — `reviewersJson`, `collectReviewers`, PR drill-down + governance copy | S–M  | 1a–1d      | **Done**    |
| 6     | **7b** | **File ownership + maintenance cost** — `filesJson`, `buildFiles()` from PR history, Files tab columns | M    | 7a         | **Done**    |
| 7     | **7c** | **Incident ↔ code traceability** — `IncidentCodeLink`, deploy anchor, “Likely related changes” on incident detail | L    | 7a, 7b     | **Done**    |
| 8     | **7d** | **Accountability dashboard** — `accountability` snapshot block, card on `/code-analysis`, executive claim | S–M  | 7a, 7b     | **Done**    |
| 9     | **2**  | **Continuous compliance monitoring** — `ComplianceFinding` + seeded rules; eval on sync + periodic baseline | L    | 3 (done)   | **Done**    |
| 10    | **4**  | **Background compliance-check agent** — Mastra agent + tools on heartbeat/webhook | M    | 2, 3       | **Done**    |
| 11    | **9**  | **90-day Jira calibration** — onboarding pass: history pull, workflow detection, LLM calibration model | L    | 5, 6 (done) | **Next**    |
| 12    | **8**  | **Problem predictor** — leading indicators first (trend/threshold), then cross-domain prediction agent | L    | 1–7, 9     | Not started |

**Already shipped (out of sequence):** 1, 2, 3, 4, 5, 6, 7, 10.

### Rationale

- **1a → 1d** — Smallest shippable slice first; no LLM until tickets are linked. Unblocks scoring, risk, dashboard, and later accountability.
- **7a → 7d** — Accountability builds on code-analysis ingest: named reviewers, file-level cost proxy, incident correlation, leadership surface.
- **2 → 4** — Compliance engine before agent; #3 (per-project rules) is already done.
- **9 after trust basics** — Hygiene (#5) and delivery signals (#6) exist; calibration reduces false “bad project” flags on connect.
- **8 last** — Predictor consumes signals from code risk, compliance, delivery, accountability, and calibrated Jira; deliver heuristics before full agent correlation.

---

## Point 2 — shipped (2026-06-30)

| Slice | Delivered |
| ----- | --------- |
| **2a** | `ComplianceFinding` + `ComplianceRuleState` models; `compliance` RBAC module; 90d prune for resolved findings |
| **2b** | Seeded rule catalog (`ai_pr_no_review`, `unlinked_ai_pr`, `large_ai_commit`, `high_risk_ai_pr`, `no_test_delta`, `low_completion`); eval hooks after sync + enrich |
| **2c** | `POST /api/cron/compliance/eval` + `runScheduledComplianceEval`; idempotent upsert, auto-resolve/reopen lifecycle |
| **2d** | `GET /api/compliance/findings`; `ComplianceFindingsPanel` on `/governance`; `buildComplianceClaim()` on `/dashboard` |

**Validated:** Connexus org — cron eval created `large_ai_commit` finding against existing code-analysis data.

**Ops (production):** after GitHub code-analysis sync, schedule in order:
1. `POST /api/cron/code-analysis/enrich`
2. `POST /api/cron/compliance/eval`

Both use `Authorization: Bearer $PLATFORM_WORKER_SECRET`; optional body `{ "organizationId": "..." }`.

---

## Point 7 — shipped (2026-06-30)

| Slice | Delivered |
| ----- | --------- |
| **7a** | `reviewersJson` on PRs; `collectReviewers()`; “Reviewed by” in PR expand row; governance signals name reviewer gap |
| **7b** | `filesJson` on PRs; `buildFiles()` from PR file history; Owner / Reviewers / Cost on Files tab |
| **7c** | `IncidentCodeLink` model; deploy `pullRequestNumber` anchor; `correlateIncidentCodeChanges()`; incident detail “Likely related changes” |
| **7d** | `accountability` snapshot metrics; `AccountabilityCard` on `/code-analysis`; `buildAccountabilityClaim()` on `/dashboard` |

**Follow-ups (not blocking close):** re-sync GitHub code analysis to backfill `reviewersJson` / `filesJson`; add Jira assignee to incident people rollup; stronger deploy SHA anchor when release metadata includes merge commit.

---

## Point 4 — shipped (2026-06-30)

| Slice | Delivered |
| ----- | --------- |
| **4a** | `ComplianceFindingsPanel` on `/code-analysis` (RBAC-gated); server-load via `loadComplianceFindings` + summary |
| **4b** | `GET /api/agents/me/compliance/findings`; Mastra tool `aidos_list_compliance_findings`; `read_compliance_findings` on GOVERNANCE allowlist |
| **4c** | `compliance_finding` inbox items; Governance agent instructions; `aidos_create_recommendation` with `idempotencyKey` → `Recommendation` + `Approval` (deduped by finding id) |
| **4d** | `enqueueComplianceEvaluatedWakeups` on `newCritical`; `EVENT_ROLE_ROUTING["compliance.evaluated"]` → governance; Super delegates via `compliance_delegate` inbox |

**Validated:** `npm run build` green; tool allowlist tests pass. Manual test: enrich → compliance eval → findings on `/code-analysis` → invoke Governance agent → recommendation + approval for critical findings.

**Ops (production):** unchanged from Point 2 — after GitHub code-analysis sync, schedule enrich then compliance eval. Run agent worker (`POST /api/cron/agents/worker` or `npm run worker:agents` in dev) so compliance eval wakeups drain.

---

## What to develop next

**Recommended focus: Point 9 — 90-day Jira calibration** (order #11 in the table above).

Why now:
- Points 2 and 4 are done — compliance engine + Governance agent remediation loop.
- Hygiene (#5) and delivery signals (#6) exist; calibration reduces false “bad project” flags on Jira connect.

**After Point 9 (in order):**
1. **Point 8** — Problem predictor (heuristic leading indicators first, then cross-domain agent).

**Optional quick wins:**
- Point 7 follow-ups: Jira assignee in incident people rollup; merge-commit SHA on deploy when available from release/GitHub.
- Point 2 follow-up: `ComplianceRuleState` UI to enable/disable seeded rules per project (schema exists; no CRUD UI yet).

**Ops note (code analysis + compliance):** schedule enrich then compliance eval after every GitHub code-analysis sync so risk-dependent rules and completion scores stay current. Agent worker must run for compliance eval → Governance recommendation flow.

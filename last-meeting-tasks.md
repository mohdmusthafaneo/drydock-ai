# Last meeting tasks

**Meeting:** 2026-06-25 stakeholder feedback  
**Source:** [STAKEHOLDER-MEETING-MINUTES.md](./STAKEHOLDER-MEETING-MINUTES.md)  
**Last updated:** 2026-06-30


| #   | Point                                            | Size | Status      | Notes                                                                             |
| --- | ------------------------------------------------ | ---- | ----------- | --------------------------------------------------------------------------------- |
| 1   | AI-generated code risk on the dashboard          | L    | **Done**    | 1a–1d shipped: Jira linkage, LLM completion score, composite risk, dashboard + executive claim |
| 2   | Continuous compliance monitoring                 | L    | Not started | Rule engine + continuous code checks                                              |
| 3   | Customizable compliance & governance per project | M    | Done        | Project-scoped rulesets                                                           |
| 4   | Background compliance-check agent                | M    | Not started | Depends on 2, 3                                                                   |
| 5   | Jira misgovernance warning                       | M    | Done        | Hygiene score + leadership warning                                                |
| 6   | Spillover / delayed / reopened indicators        | M    | Done        | Overdue shipped; spillover + reopened via JQL sync, signals, delivery-analysis UI |
| 7   | Accountability & cost of maintaining code        | L    | Not started | Ownership ledger, incident traceability                                           |
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
| 5     | **7**  | **Accountability & maintenance cost** — reviewer identity, file-level ownership, incident traceability | L    | 1a–1d      | **Next**    |
| 6     | **2**  | **Continuous compliance monitoring** — `ComplianceRule` + `ComplianceFinding`; eval on sync + periodic baseline | L    | 3 (done)   | Not started |
| 7     | **4**  | **Background compliance-check agent** — Mastra agent + tools on heartbeat/webhook | M    | 2, 3       | Not started |
| 8     | **9**  | **90-day Jira calibration** — onboarding pass: history pull, workflow detection, LLM calibration model | L    | 5, 6 (done) | Not started |
| 9     | **8**  | **Problem predictor** — leading indicators first (trend/threshold), then cross-domain prediction agent | L    | 1–7, 9     | Not started |

**Already shipped (out of sequence):** 1, 3, 5, 6, 10.

### Rationale

- **1a → 1d** — Smallest shippable slice first; no LLM until tickets are linked. Unblocks scoring, risk, dashboard, and later accountability.
- **7 after 1** — Accountability needs committer/reviewer + AI risk context from the code-analysis stack.
- **2 → 4** — Compliance engine before agent; #3 (per-project rules) is already done.
- **9 after trust basics** — Hygiene (#5) and delivery signals (#6) exist; calibration reduces false “bad project” flags on connect.
- **8 last** — Predictor consumes signals from code risk, compliance, delivery, and calibrated Jira; deliver heuristics before full agent correlation.

---

## What to develop next

**Recommended focus: Point 7 — Accountability & cost of maintaining code** (order #5 in the table above).

Why now:
- Point 1 is done — commits/PRs link to Jira, carry completion + risk scores, and surface on Code Analysis and the executive dashboard.
- Accountability is the natural follow-on: who owns AI-generated changes, who reviewed them, and how to trace incidents back to code + tickets.

Suggested slices (same pattern as Point 1):

| Slice | Work | Outcome |
| ----- | ---- | ------- |
| **7a** | Reviewer identity on PRs/commits — persist approver logins, show in drill-down | Clear “who signed off on AI code” |
| **7b** | File-level ownership hints — top contributors per path from sync history | Maintenance-cost signal per area |
| **7c** | Incident ↔ deploy ↔ commit traceability — link observability/incidents to recent merges | “This outage maps to these changes” |
| **7d** | Dashboard surface — accountability claim or card on executive / code-analysis views | Leadership sees ownership gaps without digging |

**After Point 7 (in order):**
1. **Point 2** — Continuous compliance monitoring (rule engine + findings on sync).
2. **Point 4** — Background compliance-check agent (blocked until #2).
3. **Point 9** — 90-day Jira calibration on connect.
4. **Point 8** — Problem predictor (last; consumes code risk, compliance, delivery, calibrated Jira).

**Ops note for Point 1 in production:** schedule `POST /api/cron/code-analysis/enrich` (platform worker) after GitHub code-analysis sync so completion and risk scores stay current.

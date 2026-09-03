# DryDock — Build Plan

Phased delivery plan for the pivot from AIDOS to DryDock.
Concept and invariants: `docs/DRYDOCK-CONCEPT.md`.

**Status:** planning. No phase started.

---

## Sequencing rationale

The product has three possible organizing structures — the Ledger (inventory of test trust),
the Briefing (daily decision queue), and the Certificate (signed release artifact). They are
layers rather than alternatives: **the Ledger is the substrate, the Briefing is its face, the
Certificate is the moment of resolution.**

We build the Ledger and the Briefing together as the pilot, and hold the Certificate for the
release-gate phase. The Standard sits between them: it needs the corpus ingested, and its
ratification ritual reuses the rulings mechanic built for the Briefing.

Signal Integrity is first because it depends only on CI results. It requires no knowledge of
the client's test frameworks, no change to their pipeline, and no cooperation from any team —
so it can ship while the harder questions are still open.

---

## Phase 0 — Foundations

Nothing in this phase is visible to the client. Everything after it is blocked on it.

### 0.1 Rename AIDOS → DryDock

Single pass, all layers. Session cookie (`aidos_session`), environment variable prefixes, agent
IDs, Mastra agent registration, route names, schema model names where they carry AIDOS
vocabulary, UI copy, and docs. Requires a migration for the schema renames and a forced
re-login for the cookie change.

### 0.2 Strip the sunsetted surface

Remove routes, components, lib modules, API handlers, Mastra agents, cron jobs, and schema
models for: productivity, code health / Repowise, DevOps / AWS, the Accelerator, the discovery
wizard, Delivery DNA, governance policy and compliance rules, and the leadership executive
briefing. Park Grafana and Prometheus behind a flag rather than deleting.

Keep and repurpose: auth, tenancy, RBAC, GitHub and Jira connectors, releases, audit, pgvector,
the Mastra runtime, and the incident model.

### 0.3 Test result ingestion

The load-bearing piece. Per-test results out of GitHub Actions.

**Primary path:** download test report artifacts from workflow runs via the Actions API and
parse JUnit XML (plus Playwright and Allure JSON where present). Requires `actions:read` and
changes nothing in the client's pipeline — correct for a pilot.

**Robust path:** a reporting step in their workflow that posts results to a DryDock ingest
endpoint. One line of YAML. Offer as an upgrade once the pilot proves value.

Current GitHub sync caps at 50 commits and 25 pull requests per repo over 90 days. That will
not survive a large multi-repo e-commerce platform and needs rework here.

### 0.4 Test identity

A test is identified by repository, file path, suite path, and name — all four of which change
under refactoring. Naive identity orphans history and invents phantom new tests, which
silently ruins every flakiness calculation downstream.

Approach: a `stableKey` derived from normalized path and name, plus an alias table and a
fuzzy re-linking pass that reconnects history across renames and moves. Re-links below a
confidence threshold are surfaced for confirmation rather than applied silently.

### 0.5 Data model

New:

| Model | Purpose |
|-------|---------|
| `CiRun` | A workflow run: repo, workflow, commit, branch, conclusion, timing. |
| `TestCase` | A test's stable identity, current location, category, lifecycle state. |
| `TestCaseAlias` | Prior identities, for history re-linking across renames. |
| `TestExecution` | Per-test, per-run outcome, duration, retry count, error fingerprint. Timescale hypertable. |
| `TestTrustState` | Derived per-test rollup recomputed on ingest. |
| `Finding` | A single observation needing attention, with evidence and cluster key. |
| `Ruling` | The architect's decision on a finding: reason code, scope, expiry. |
| `Precedent` | A ruling promoted to a rule after corroboration and ratification. |

Repurposed: `Incident` → `Escape`, `IncidentCodeLink` → `EscapeTestLink` (which test should
have caught it, and what state it was in).

**Schema constraint from invariant 1:** no model in this set carries an author, team, or vendor
field. Evidence links to a pull request or file path; it does not link to a person.

---

## Phase 1 — The Ledger

The pilot demo. *"1,247 tests. 891 are giving you real signal. 356 are not."*

Detectors, in rough order of value:

1. **Never-failed** — passed consistently, never red, in an area that keeps changing. Requires
   correlating test history against commit activity in the covered path.
2. **Flake** — same commit, divergent outcomes.
3. **Retry-masked** — passes only on retry.
4. **Skipped and quarantined** — with creep over time.
5. **Permafail** — red beyond a threshold.
6. **Semantic duplicates** — embedding-clustered test bodies. Reuses existing pgvector setup.
7. **Signal decay** — suites that have not caught a real regression.

Plus **failure clustering** by normalized error fingerprint, so the queue's unit is a root
cause rather than an occurrence.

Surface: the trust count, its decomposition by reason, and a drill from any reason to the
tests, then to the run history and error text. No charts.

**Exit criterion:** the QA Architect can look at the number, disagree with something in it, and
find the raw evidence in two clicks.

---

## Phase 2 — The Briefing and Rulings

The daily face, and the mechanic that keeps it from becoming noise.

- Bounded queue, verb-tagged cards, source chips, neutral evidentiary voice.
- "Since last release" as the default lens — the decision unit is a release.
- The designed silence state.
- Data honesty banner for staleness and partial syncs.
- Ranking with an inspectable rationale and a stated time cost.

**Rulings** per `DRYDOCK-CONCEPT.md` §6: reason-carries-scope taxonomy, the triple check
(similarity across multiple dimensions, corroboration before generalization, demotion rather
than suppression below the confidence bar), the suppressed-items view, and expiry with
re-raise on material change or escape.

The `Approval` machinery is reframed here as the decision log rather than a governance chain —
one person decides, and the system records what they knew at the time.

**Exit criterion:** the architect uses it for a week without the queue filling with things they
have already dealt with.

---

## Phase 3 — The Standard

- Mine the corpus for the patterns actually in use; cluster by structural shape.
- Ratification ritual: one or two canonical-form decisions surfaced per week.
- Conformance findings generated against the ratified Standard, feeding the same queue.
- The waiver flywheel: corroborated rulings from Phase 2 promote into the Standard.

The text and judgment analysis layers land here. The structure plane — per-framework AST
adapters — is scoped only once the client's stack is known.

---

## Phase 4 — Risk Coverage and the Certificate

- Map tests to Jira components and epics, and those to business-critical journeys.
- Named coverage gaps, with integration seams as a specific focus.
- Escape replay: for every production defect, was there a test, was it green, was it skipped,
  did it never exist.
- Confidence calibrated against escape history, with its own accuracy tracked openly.
- The Certificate: what was verified, what was not, what is unreliable, what risk is accepted,
  and the signed decision.

---

## Blockers

Client questions that gate Phase 0. None are design decisions.

1. **Do their CI runs currently upload a test report artifact, and in what format?** If yes, we
   ingest with zero pipeline changes. If no, it is a one-line workflow addition — small, but an
   ask.
2. **Repository and org access.** How many repositories, roughly how many tests, and whether we
   get a GitHub App installed org-wide or a narrower grant.
3. **Do Jira tickets link to tests or components in a traceable way?** Risk coverage in Phase 4
   depends on it. If the link is absent, coverage becomes a much harder inference problem and we
   should know before committing to it.
4. **Test frameworks and languages.** Not blocking for Phases 0–2 by design; needed to scope the
   structure plane in Phase 3.

---

*Last updated: 2026-09-03.*

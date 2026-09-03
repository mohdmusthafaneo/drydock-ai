# DryDock — Build Plan

Phased delivery plan for the pivot from AIDOS to DryDock.
Concept and invariants: `docs/DRYDOCK-CONCEPT.md`.

**Status:** Phase 0–4 basic surfaces are in. Session cookie is `drydock_session`
(legacy `aidos_session` still accepted). Sunsetted AIDOS pages redirect to Briefing.
Grafana/Prometheus stay behind `DRYDOCK_OBSERVABILITY_ENABLED`. GitHub sync downloads
Actions artifacts and ingests JUnit XML. Briefing, Ledger, Standard, Certificate, and
Escapes bind to the database when data exists.

**Current slice:** Product loop Ingest → Ledger → Briefing → Ruling → Certificate is
wired for the QA Architect. Semantic-duplicate detection is name/path inference (text
plane), labelled as inference. Incident rows are shown as Escapes without renaming the
table.

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

Single pass, all layers. Session cookie (`aidos_session` → `drydock_session`), environment
variable prefixes (`DRYDOCK_PROCESS_ROLE` with AIDOS fallback), agent display name, UI copy,
and docs. Schema table names that are not AIDOS-vocabulary stay; Incident remains the store
for Escapes.

**Done** for cookie, env aliases, assistant copy, and user-facing strings. Mastra agent id
`aidosAssistant` kept so existing threads do not orphan.

### 0.2 Strip the sunsetted surface

Remove routes, components, lib modules, API handlers, Mastra agents, cron jobs, and schema
models for: productivity, code health / Repowise, DevOps / AWS, the Accelerator, the discovery
wizard, Delivery DNA, governance policy and compliance rules, and the leadership executive
briefing. Park Grafana and Prometheus behind a flag rather than deleting.

**Done** at the product surface: those routes redirect to Briefing. Worker/Mastra domain
agents remain registered so existing jobs do not crash. Observability is gated by
`DRYDOCK_OBSERVABILITY_ENABLED`.

Keep and repurpose: auth, tenancy, RBAC, GitHub and Jira connectors, releases, audit, pgvector,
the Mastra runtime, and the incident model.

### 0.3 Test result ingestion

The load-bearing piece. Per-test results out of GitHub Actions.

**Primary path:** download test report artifacts from workflow runs via the Actions API and
parse JUnit XML (plus Playwright and Allure JSON where present). Requires `actions:read` and
changes nothing in the client's pipeline — correct for a pilot.

**Robust path:** a reporting step in their workflow that posts results to a DryDock ingest
endpoint. One line of YAML. Offer as an upgrade once the pilot proves value.

**Done:** GitHub sync lists up to 50 workflow runs per repo, downloads test-like artifacts,
extracts JUnit XML, and ingests. POST `/api/drydock/ingest` remains the explicit upgrade path.
Commit/PR sync caps raised to 100 (GitHub API maximum per page).

### 0.4 Test identity

**Done:** `stableKey`, alias table, fuzzy similarity with confirm threshold.

### 0.5 Data model

**Done:** CiRun, TestCase, TestCaseAlias, TestExecution, TestTrustState, Finding, Ruling,
Precedent. Added StandardPattern and ReleaseCertificate. Incident is the Escape store.

**Schema constraint from invariant 1:** no model in this set carries an author, team, or vendor
field. Evidence links to a pull request or file path; it does not link to a person.

---

## Phase 1 — The Ledger

**Done for the six CI detectors + semantic duplicates (name Jaccard, labelled inference).**
Failure clustering remains by error fingerprint on findings.

**Exit criterion:** the QA Architect can look at the number, disagree with something in it, and
find the raw evidence in two clicks.

---

## Phase 2 — The Briefing and Rulings

**Done for the pilot:** bounded queue, verb tags, honesty banner, silence state, rulings with
reason-carries-scope, suppressed-items drawer.

---

## Phase 3 — The Standard

**Basic:** mine shapes from names/paths, surface one or two candidates, ratify or reject.
Conformance findings against the ratified Standard are not yet generated on every push.

---

## Phase 4 — Risk Coverage and the Certificate

**Basic Certificate:** verified / not verified / unreliable counts, escapes on the record,
architect sign-off (ship / hold / accept risk). Jira journey mapping and escape replay against
individual tests are not yet automated.

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

*Last updated: 2026-09-04.*

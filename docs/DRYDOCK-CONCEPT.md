# DryDock — Concept & Invariants

**Canonical reference for product, engineering, and design.**
When building features, UI copy, schema, or demos, align with this document.

DryDock is a fork of AIDOS. The AIDOS product line is sunsetted. Where this document
conflicts with any `AIDOS-*` doc, this document wins.

---

## 1. The one question

> **Can I trust green?**

A large e-commerce platform is verified entirely by automated tests. There is no manual QA.
Test code is written by QA engineers — increasingly with generative AI — pushed to GitHub, and
executed by CI runners. A single **QA Architect** is accountable for whether that machinery
produces a trustworthy answer.

They cannot read every test. They cannot review every run. And they are asked, every release,
to say whether it is safe to ship.

DryDock exists to make that answer defensible.

**DryDock is not** a test runner, a coverage tool, a code review bot, an engineering
productivity platform, or a dashboard product. It is the layer that tells the QA Architect
which parts of their safety net are real.

### One-line positioning

> **DryDock tells you which of your green checks actually mean something.**

---

## 2. Who it is for

**Primary personas (2026-09 redirect):**

1. **QA Architect** — owns test strategy, reviews automation they did not write, and signs
   off on release quality. Scarce resource: attention. Professional risk: a production miss
   they cleared.
2. **Engineering leadership** — uses the Overview dashboard for delivery confidence, pillar
   scores, attention items, and pending leadership decisions (approvals).

The Overview is the landing surface. Test-trust workflows (Tests / Today / Conventions /
Sign-off / Misses) remain available beside Delivery, Code, QA, Risk, Compliance, and Reports.

---

## 3. Invariants

These are hard rules. Breaking one is a product defect, not a tradeoff.

1. **No metric is ever grouped by person.** Author, vendor, and individual contributor are
   never reporting dimensions. **Team / project** (e.g. a Jira project key) may filter
   Overview and delivery metrics. Evidence still links to files and PRs — never to people.
   The schema must not aggregate findings to a human.

2. **Nothing is silently suppressed.** Every issue the system hides is reachable in one
   click, with the reason and the decision that hid it. Discovering that DryDock concealed
   something without recourse would end its credibility permanently.

3. **The architect can always overrule the system, on the record.** A tool that cannot be
   corrected gets ignored. Disagreement is a first-class input, not an error state.

4. **DryDock only advises.** DryDock never writes to GitHub or Jira, never modifies tests, never
   disables anything on its own, and never blocks CI or deploys. It informs a human decision.

5. **Every claim is traceable to evidence.** No number appears without a path to the raw
   material behind it — the test file, the run history, the error text. Inference is always
   labelled as inference.

6. **All data is scoped by `organizationId` from session.** Unchanged from AIDOS.

7. **The product works for a single-team project.** The client's multi-vendor situation is
   context, not a product dimension. Nothing in the design may assume more than one team.

---

## 4. Vocabulary

### User-facing language (UI, agent replies, help text)

Prefer plain English. Users should not need a glossary.

| User term | Meaning |
|-----------|---------|
| **Today** | What needs the architect’s attention now (bounded queue). |
| **Tests** | Inventory of tests and whether each looks trustworthy. |
| **Conventions** | Approved patterns for how tests should be written here. Grown by choosing preferred forms from existing practice, not by authoring a style guide up front. |
| **Sign-off** | The signed release decision: what was verified, what was not, and the call. |
| **Misses** / **Missed in production** | Production bugs the suite should have caught. Used to check whether DryDock’s release advice matches reality. |
| **Issue** | A single observation about a test or suite that may need attention. |
| **Decision** | The architect’s call on an issue, with a reason that sets how widely it applies. |
| **Earlier decision** | A past decision that still covers later, materially similar issues. |
| **Trustworthy** | Produces a meaningful check — expressed as a count, never a score. |
| **Hidden by earlier decisions** | Issues set aside by a prior decision; always one click away with the reason. |

### Problem category labels (UI)

| User label | Meaning |
|------------|---------|
| **Always green (never been red)** | Passed consistently while covered code keeps changing — suspicious. |
| **Unstable on the same commit** | Same commit, different outcomes. |
| **Only passes on retry** | Green only after a second attempt; first run failed. |
| **Skipped or disabled** | Disabled / skipped count rising over time. |
| **Always failing** | Red for a long time; the team works around it. |
| **Hasn’t caught a real bug lately** | Suite runs green but has not caught a confirmed regression recently. |
| **Near-duplicate tests** | Same check under different names (educated guess from names). |

### Engineering aliases (schema, code, URLs — not UI)

Keep these internally; do not surface them as primary labels:

| Internal | User-facing |
|----------|-------------|
| Briefing (`/briefing`) | Today |
| Ledger (`/ledger`) | Tests |
| Standard (`/standard`) | Conventions |
| Certificate (`/certificate`) | Sign-off |
| Escape (`/escapes`) | Misses |
| Finding | Issue |
| Ruling | Decision |
| Precedent | Earlier decision |
| Inspection | Full analysis pass |
| Corpus | Your tests / the suite |
| Recommend-only | DryDock only advises — it never blocks CI or deploys |

Reintroduced on the Overview (2026-09): Delivery Confidence score, pillar breakdown,
Approvals as “Waiting on leadership.” Deprecated elsewhere: Delivery DNA wizard framing,
Accelerator.

---

## 5. Pillars

### 5.1 Which greens are trustworthy — the trust layer

Which green results carry information. Derived entirely from CI run history and test reports,
so it requires no knowledge of the test framework and no cooperation from any team.

- **Always green (never been red)** — passed consistently, never once red, in code that keeps
  changing. Either the code is perfect or the test asserts nothing. The characteristic
  pathology of AI-generated tests, and the highest-value issue available from CI data alone.
- **Unstable on the same commit** — same commit, different outcomes.
- **Only passes on retry** — tests that only pass on a second attempt. The pipeline is green
  even though the first run failed.
- **Skipped or disabled** — the disabled count over time. Suites rot this way silently.
- **Always failing** — red for weeks, everyone working around it.
- **Failure clustering** — group by normalized error fingerprint. Fourteen red tests with one
  root cause is one problem, not fourteen.
- **Hasn’t caught a real bug lately** — has this suite caught a real regression recently? A
  suite that only ever goes red on unstable runs carries no information regardless of its size.

### 5.2 Conventions — codified taste

The architect's judgement, extracted without asking them to write a document.

Mine existing tests for the patterns actually in use, then ask the architect to pick a
preferred form: *"there are six ways this codebase waits for an element — which is right?"*
Choosing rather than authoring means Conventions are derived from real practice, take an
afternoon instead of a quarter, and impose no single team's style on the others.

Choosing conventions is a **recurring ritual**, not a setup wizard. One or two pattern
decisions a week, surfaced as new inconsistencies appear.

### 5.3 Conformance — Conventions applied at scale

Every test evaluated against the approved Conventions, uniformly, on every push. The
architect's review without the architect having to perform it, and without anyone being
singled out.

### 5.4 Risk Coverage — where the exposure is

Not line coverage. Tests mapped to Jira components and to the business-critical journeys of an
e-commerce platform: checkout, payment, cart, search, product detail, promotions, fulfilment.
The valuable output is a named gap — *"guest checkout with a promo code has no automated
coverage, and it changed three times this sprint"* — not a percentage.

Integration seams between modules are a specific focus: coverage falls through them and no one
owns them.

### 5.5 Release confidence — the calibrated verdict

The decision is made per **release**. Confidence is composed from the four pillars above plus
change volume in the affected areas, and it is **checked against production misses**: every
production defect is replayed against the suite (was there a test, was it green, was it
skipped, did it never exist) and the answer tunes the model.

A production miss is a suite failure. Never a person's failure. This is the most useful metric
in the product and it is inherently blame-free.

Output is the **release sign-off**: what was verified, what was not, what is known unreliable,
what risk is being accepted, and the architect's decision with rationale.

---

## 6. Decisions and earlier coverage

How the architect disagrees, and how the system learns from it.

### The reason decides how widely it applies

The architect never draws a boundary by hand. Each dismissal reason implies how far the
decision reaches:

| Reason | Applies to |
|--------|------------|
| Intentional for this specific test | This instance only. Never generalizes. |
| Correct for this kind of test | This kind of test (smoke, contract, e2e). |
| Required by how we integrate with *X* | Anything touching that dependency. The most common useful generalization. |
| Known, already being fixed | This instance, time-boxed. A reminder, not a lasting decision. |
| Accepted risk for now | This instance, expires at the next release. |
| This issue is wrong | Report a DryDock mistake — not a lasting decision. |

The last row matters. *"You're wrong"* and *"you're right but it's fine"* are different signals
and most tools collapse them into one Dismiss button, then learn garbage from the mixture. Only
the second teaches Conventions; the first degrades the detector's confidence.

A custom reason field is always available. Custom reasons are clustered over time and recurring
ones are proposed for promotion into the list.

### The triple check

Three independent gates before a decision hides anything on its own.

**Similarity** must match on more than shape: same rule, same structural pattern, *and* same
context — dependency, tag, directory, journey. Embedding similarity may be one input and is
never the decider. An issue in one place is not the same as an issue in another that merely
looks alike.

**Corroboration** means one decision resolves its own instance and creates no rule. On the
third consistent decision of the same class, the system asks whether it should become part of
Conventions. The generalization decision stays explicitly with the architect.

**Confidence** is not binary. Below the bar, issues are **covered by earlier decisions**, not
silently removed: they collapse into a single line — *"14 items look covered by earlier
decisions"* — that opens in one click. The queue stays short; nothing disappears.

### Expiry and re-raise

A decision is not forever. It re-raises when the test changes materially, when the rule's
definition changes, when it ages past a major release, and — most importantly — **when a
production miss lands in territory the decision covered.** A production defect in an area the
architect declared fine is the strongest learning signal in the system, and it surfaces
attached to the original decision.

---

## 7. Analysis layers

The client's test frameworks are not yet known, and the product should not depend on knowing
them. Analysis is layered by how much framework knowledge each layer requires.

| Layer | Needs | Gives |
|-------|-------|-------|
| **Result plane** | Nothing. JUnit XML or equivalent. | Per-test outcome, duration, retry, skip history. Which greens are trustworthy. |
| **Text plane** | Source as plain text. | Hardcoded waits, naming, file bloat, semantic duplication via embeddings. |
| **Judgment plane** | A model reading the test. | Assertion meaningfulness, intent-vs-name mismatch, missing negative cases. |
| **Structure plane** | A per-framework AST adapter. | Assertion depth, selector strategy, fixture and setup analysis. |

Build order is result → text → judgment → structure. Only the last layer requires knowing the
stack, and it is the last thing we build.

---

## 8. Interface principles

The client's explicit complaint: dashboards are junk data and graphs nobody reads. These are
the rules that prevent us from building one.

1. **One question per screen.** Home answers exactly one: *can I trust the suite today, and
   what needs me?* Everything else is a click away.
2. **Decisions, not metrics.** Every card ends in an action — rule, route, snooze, sign off. A
   card with no available action is a report, and reports live in a drawer.
3. **Trust on test surfaces is a count, not a score.** *"1,247 tests. 891 are giving you real
   signal. 356 are not."* On the **Overview**, a composite delivery-confidence score and
   gauge are permitted (see 2026-09 redirect).
4. **Charts on Overview are in scope.** Delivery trend, sprint burndown, and activity heatmap
   ship on `/dashboard`. Other surfaces still prefer sentences, counts, and lists unless a
   chart names the decision it changes.
5. **Answer first, evidence on demand.** Lead with a plain sentence, disclose progressively down
   to the actual test file and the actual run history.
6. **Deltas over levels.** *"Four new critical-path gaps since the last release"* is read.
   *"Coverage: 73%"* is not.
7. **A bounded queue.** Show the top few, make the ranking rationale inspectable, hide the tail
   deliberately. Name the time cost: *"today's queue: about 20 minutes."*
8. **Cluster before listing.** The unit of the queue is a root cause, not an occurrence.
9. **Design the silence.** *"Nothing needs you today. 891 of 1,247 holding. Next release
   checkpoint in four days."* A tool comfortable being quiet is believed when it speaks.
10. **Neutral evidentiary voice.** *"Overnight analysis of 3 repositories and 412 runs."* Not
    *"I checked your repos for you."* DryDock reads as an instrument, not a chatbot.
11. **Be honest about your own data.** Staleness, partial syncs, and low-confidence inferences
    are stated plainly on the surface that uses them.

Two verb tags carried over from the team's first mockup, because they work: each card is
labelled with the kind of attention it needs before the reader parses the content.

---

## 9. Out of scope

Removed from the AIDOS surface and not part of DryDock (unless reintroduced below):

MVP Accelerator · the discovery wizard in its current form · Delivery DNA as an activation
funnel · Grafana and Prometheus observability (deferred, not deleted).

**Re-scoped into product (2026-09 Overview redirect):** engineering productivity Overview
(delivery / code / QA / compliance pillars), Delivery Analysis, Code Analysis, QA cockpit,
Risk and Reports placeholders, governance/compliance findings, Approvals as leadership
decisions, executive-style delivery confidence on `/dashboard`.

Retained: authentication, tenancy, RBAC, GitHub and Jira connectors, audit / decision log,
releases, pgvector embeddings, Mastra runtime, production misses (escapes).

---

## 10. Related docs

- `docs/DRYDOCK-BUILD-PLAN.md` — phased delivery plan and current status (Phase 5 Overview)
- `docs/DESIGN.md` — Connexus Overview design tokens
- `docs/design/overview-mockup.jpg` — pixel reference for Overview + shell
- `.cursor/rules/drydock-project.mdc` — engineering invariants for agents

Superseded: `docs/AIDOS-USP.md`, `docs/AIDOS-ENTERPRISE-ROADMAP.md`,
`docs/AIDOS-PHASE-1-EXECUTION.md`, `docs/MVP-DEVELOPMENT-PLAN.md`,
`docs/AIDOS-PRODUCT-OVERVIEW.md`. Retained for reference only.

---

## 11. Product redirect — 2026-09 Overview

Dated decision: ship a Connexus-style Overview as the landing page and app shell, matching
[`docs/design/overview-mockup.jpg`](design/overview-mockup.jpg).

| Revoked / amended | New rule |
|-------------------|----------|
| QA Architect only | + engineering leadership on Overview |
| No team dimension | Project/team filter allowed; never person |
| No gauges / composite score | Delivery confidence score + gauge on Overview |
| No charts in v1 | Trend, burndown, heatmap on Overview |
| Sunsetted Delivery/Code/Compliance | Re-enabled as top tabs + pillar tiles |

Preserved: advise-only, nothing silently suppressed, evidence traceability, tenancy by
`organizationId`, no metrics by person.

Visual system: `docs/DESIGN.md`. Shell: org name in sidebar, section tabs in top bar,
workspace list = Jira projects.

---

*Last updated: 2026-09-06. Update this file when the concept evolves; do not fork competing
definitions elsewhere.*

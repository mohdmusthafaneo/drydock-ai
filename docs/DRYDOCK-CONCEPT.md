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

**Primary and only persona: the QA Architect.**

They own test strategy across the platform, review automation work they did not write, and
sign off on release quality. Their scarce resource is attention. Their professional risk is
an escape they cleared.

Everything in DryDock is designed for one expert user with limited time and real
accountability. There is no manager view, no team view, and no rollup for leadership in the
initial product. Adding audiences later is a deliberate decision, not a default.

---

## 3. Invariants

These are hard rules. Breaking one is a product defect, not a tradeoff.

1. **No metric is ever grouped by contributor.** The system has no concept of author, team, or
   vendor as a reporting dimension. The unit of analysis is always the test, the suite, or the
   surface — never the person who wrote it. Evidence links out to real files and real pull
   requests so findings are auditable; the schema contains no path that aggregates findings to
   a human.

2. **Nothing is silently suppressed.** Every finding the system hides is reachable in one
   click, with the reason and the ruling that hid it. Discovering that DryDock concealed
   something without recourse would end its credibility permanently.

3. **The architect can always overrule the system, on the record.** A tool that cannot be
   corrected gets ignored. Disagreement is a first-class input, not an error state.

4. **Recommend-only.** DryDock never writes to GitHub or Jira, never modifies tests, never
   quarantines anything on its own, and never gates a pipeline. It informs a human decision.

5. **Every claim is traceable to evidence.** No number appears without a path to the raw
   material behind it — the test file, the run history, the error text. Inference is always
   labelled as inference.

6. **All data is scoped by `organizationId` from session.** Unchanged from AIDOS.

7. **The product works for a single-team project.** The client's multi-vendor situation is
   context, not a product dimension. Nothing in the design may assume more than one team.

---

## 4. Vocabulary

Use these terms consistently in schema, code, and UI copy.

| Term | Meaning |
|------|---------|
| **The Standard** | The ratified body of test conventions for an organization. Replaces Delivery DNA. Grown by ratification, not authored. |
| **Trust** | The share of the suite that produces meaningful signal. Expressed as a count, never a score. |
| **The Ledger** | The inventory of tests and their trust state. The substrate of the product. |
| **The Briefing** | The daily surface: a bounded queue of things that need the architect. |
| **The Certificate** | The signed release artifact stating what was verified, what was not, and the decision. |
| **Finding** | A single observation about a test or suite that may need attention. |
| **Ruling** | The architect's decision on a finding, with a reason that carries scope. |
| **Precedent** | A ruling applied to later, materially similar findings. |
| **Distinguishing** | Determining that a new finding is *not* covered by an existing precedent despite surface similarity. |
| **Escape** | A production defect the suite should have caught. Ground truth for calibration. |
| **Inspection** | A full analysis pass over the corpus and run history. |

Deprecated AIDOS vocabulary: Delivery DNA, Delivery Confidence score, Governance Score,
Recommendations queue, Approvals, Accelerator.

---

## 5. Pillars

### 5.1 Signal Integrity — the trust layer

Which green results carry information. Derived entirely from CI run history and test reports,
so it requires no knowledge of the test framework and no cooperation from any team.

- **Never-failed tests** — passed consistently, never once red, in code that keeps changing.
  Either the code is perfect or the test asserts nothing. The characteristic pathology of
  AI-generated tests, and the highest-signal finding available from CI data alone.
- **Flake contamination** — same commit, different outcomes.
- **Retry masking** — tests that only pass on a second attempt. The pipeline is green and the
  test is lying.
- **Skip and quarantine creep** — the disabled count over time. Suites rot this way silently.
- **Permafail** — red for weeks, everyone routing around it.
- **Failure clustering** — group by normalized error fingerprint. Fourteen red tests with one
  root cause is one problem, not fourteen.
- **Signal decay** — has this suite caught a real regression recently? A suite that only ever
  goes red on flakes carries no information regardless of its size.

### 5.2 The Standard — codified taste

The architect's judgement, extracted without asking them to write a document.

Mine the existing corpus for the patterns actually in use, then ask the architect to ratify a
canonical form: *"there are six ways this codebase waits for an element — which is right?"*
Ratification rather than authorship means the Standard is derived from real practice, takes an
afternoon instead of a quarter, and imposes no single team's style on the others.

Ratification is a **recurring ritual**, not a setup wizard. One or two pattern decisions a
week, surfaced as new drift appears.

### 5.3 Conformance — the Standard applied at scale

Every test evaluated against the ratified Standard, uniformly, on every push. The architect's
review without the architect having to perform it, and without anyone being singled out.

### 5.4 Risk Coverage — where the exposure is

Not line coverage. Tests mapped to Jira components and to the business-critical journeys of an
e-commerce platform: checkout, payment, cart, search, product detail, promotions, fulfilment.
The valuable output is a named gap — *"guest checkout with a promo code has no automated
coverage, and it changed three times this sprint"* — not a percentage.

Integration seams between modules are a specific focus: coverage falls through them and no one
owns them.

### 5.5 Release Confidence — the calibrated verdict

The decision unit is a **release**. Confidence is composed from the four pillars above plus
change volume in the affected areas, and it is **calibrated against escapes**: every production
defect is replayed against the suite (was there a test, was it green, was it skipped, did it
never exist) and the answer tunes the model.

An escape is a suite failure. Never a person's failure. This is the most useful metric in the
product and it is inherently blame-free.

Output is the **Certificate**: what was verified, what was not, what is known unreliable, what
risk is being accepted, and the architect's decision with rationale.

---

## 6. Rulings and precedent

How the architect disagrees, and how the system learns from it.

### The reason carries the scope

The architect never draws a boundary by hand. Each dismissal reason implies how far the ruling
reaches:

| Reason | Scope |
|--------|-------|
| Intentional for this specific test | This instance only. Never generalizes. |
| Correct for this kind of test | The test category (smoke, contract, e2e). |
| Required by how we integrate with *X* | Anything touching that dependency. The most common useful generalization. |
| Known, already being fixed | This instance, time-boxed. A snooze, not a ruling. |
| Accepted risk for now | This instance, expires at the next release. |
| This finding is wrong | No scope. Not a ruling — a defect report against DryDock. |

The last row matters. *"You're wrong"* and *"you're right but it's fine"* are different signals
and most tools collapse them into one Dismiss button, then learn garbage from the mixture. Only
the second teaches the Standard; the first degrades the detector's confidence.

A custom reason field is always available. Custom reasons are clustered over time and recurring
ones are proposed for promotion into the list.

### The triple check

Three independent gates before a ruling suppresses anything on its own.

**Similarity** must match on more than shape: same rule, same structural pattern, *and* same
context — dependency, tag, directory, journey. Embedding similarity may be one input and is
never the decider. A finding in one place is not the same as a finding in another that merely
looks alike.

**Corroboration** means one ruling resolves its own instance and creates no rule. On the third
consistent ruling of the same class, the system asks whether it should become part of the
Standard. The generalization decision stays explicitly with the architect.

**Confidence** is not binary. Below the bar, findings are **demoted**, not suppressed: they
collapse into a single line — *"14 items look covered by earlier rulings"* — that opens in one
click. The queue stays short; nothing disappears.

### Expiry and re-raise

A ruling is not forever. It re-raises when the test changes materially, when the rule's
definition changes, when it ages past a major release, and — most importantly — **when an
escape lands in territory the ruling covered.** A production defect in an area the architect
declared fine is the strongest learning signal in the system, and it surfaces attached to the
original ruling.

---

## 7. Analysis layers

The client's test frameworks are not yet known, and the product should not depend on knowing
them. Analysis is layered by how much framework knowledge each layer requires.

| Layer | Needs | Gives |
|-------|-------|-------|
| **Result plane** | Nothing. JUnit XML or equivalent. | Per-test outcome, duration, retry, skip history. All of Signal Integrity. |
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
3. **Trust is a count, not a score.** *"1,247 tests. 891 are giving you real signal. 356 are
   not."* The deficit decomposes into the entire work queue. No gauges, no composite index.
4. **No charts in v1.** Sentences, counts, and lists only. A chart may be added when someone can
   name the specific decision it changes.
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

Removed from the AIDOS surface and not part of DryDock:

Engineering productivity · code health and Repowise · DevOps and AWS hygiene · the MVP
Accelerator · the discovery wizard in its current form · Delivery DNA · governance policy and
compliance rules · executive briefing for leadership · Grafana and Prometheus observability
(deferred, not deleted).

Retained and repurposed: authentication, tenancy, RBAC, the GitHub and Jira connectors, the
approval and audit machinery (reframed as rulings and the decision log), releases, pgvector
embeddings, the Mastra runtime, and the incident model — which becomes **escapes**, the
calibration ground truth.

---

## 10. Related docs

- `docs/DRYDOCK-BUILD-PLAN.md` — phased delivery plan and current status
- `.cursor/rules/aidos-project.mdc` — engineering invariants for agents

Superseded: `docs/AIDOS-USP.md`, `docs/AIDOS-ENTERPRISE-ROADMAP.md`,
`docs/AIDOS-PHASE-1-EXECUTION.md`, `docs/MVP-DEVELOPMENT-PLAN.md`,
`docs/AIDOS-PRODUCT-OVERVIEW.md`. Retained for reference only.

---

*Last updated: 2026-09-03. Update this file when the concept evolves; do not fork competing
definitions elsewhere.*

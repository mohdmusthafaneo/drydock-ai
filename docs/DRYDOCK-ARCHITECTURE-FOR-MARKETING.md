# DryDock — High-Level Architecture Overview

---

## 1. What DryDock is

DryDock tells QA and engineering leadership **which green checks actually mean something**.

Large product organizations ship on automated tests. A single QA Architect (and, for delivery confidence, engineering leadership) must still answer: *is it safe to ship?* They cannot read every test or review every run. DryDock is the layer that makes that answer **defensible**.

| DryDock is | DryDock is not |
|------------|----------------|
| A trust and release-confidence instrument | A test runner or coverage tool |
| An advise-only decision support layer | A CI blocker or deploy gate |
| Evidence-backed attention for scarce experts | A chatbot or generic engineering dashboard |
| Scoped per customer organization | A people-ranking product (except a dedicated Productivity surface) |

**One-line positioning**

> DryDock tells you which of your green checks actually mean something.

**The one question**

> Can I trust green?

---

## 2. Who it is for

| Persona | What they need from DryDock |
|---------|-----------------------------|
| **QA Architect** | Know which parts of the safety net are real; decide what needs attention today; sign off on a release with a clear record |
| **Engineering leadership** | Delivery confidence, pillar health, attention items, and pending leadership decisions on a Connexus-style Overview |

Workspaces map to **Jira projects**. The sidebar shows the **tenant organization name**. All data is scoped to that organization.

---

## 3. Outcomes (what value looks like)

Use these as outcome bullets in decks, site copy, and partner briefings:

1. **Greens that mean something** — Separate real signal from checks that only look safe  
2. **Claims you can audit** — Every number leads back to the run, file, or history behind it  
3. **Misses that teach** — Production escapes show whether release advice held up  
4. **Decisions you can defend** — Overrules, hides, and precedents stay explicit and reachable  
5. **Attention that scales** — The architect sees a bounded queue, not the whole suite  

---

## 4. How DryDock sits in the customer stack

DryDock does **not** replace CI, Jira, or GitHub. It reads from them and advises humans.

```text
  ┌─────────────┐     ┌─────────────┐
  │   GitHub    │     │    Jira     │
  │  (CI, PRs,  │     │ (projects,  │
  │   artifacts)│     │  journeys)  │
  └──────┬──────┘     └──────┬──────┘
         │                   │
         └─────────┬─────────┘
                   ▼
         ┌───────────────────┐
         │     DryDock       │
         │  ingest · analyze │
         │  advise · record  │
         └─────────┬─────────┘
                   ▼
         ┌───────────────────┐
         │  Humans decide    │
         │  Architect / EM   │
         └───────────────────┘
```

**Important product promise:** DryDock **only advises**. It does not write back to GitHub or Jira, modify tests, disable suites, or block CI or deploys.

---

## 5. Logical architecture (layers)

Think of DryDock as four layers. Marketing can describe them as “how the product works,” without exposing implementation detail.

### 5.1 Connect & ingest

- Pull CI run history and test report artifacts (e.g. JUnit XML from GitHub Actions)  
- Connect Jira projects as workspaces and map tests to business journeys where useful  
- Keep everything inside the customer’s **organization** boundary  

No change to the customer’s pipeline is required for the primary path — DryDock consumes what CI already produces.

### 5.2 Analyze (trust and risk)

DryDock evaluates the suite from multiple angles, starting with what CI already reports:

| Capability | Plain-language meaning |
|------------|------------------------|
| **Trust signals** | Which greens look trustworthy vs suspicious (always green, flaky, retry-only, skipped, always failing, etc.) |
| **Conventions** | Codified taste — preferred patterns chosen from real practice, not a style guide written from scratch |
| **Conformance** | Those conventions applied uniformly across the suite |
| **Risk coverage** | Gaps on critical journeys (e.g. checkout, payment) — named gaps, not vanity % coverage |
| **Release confidence** | A calibrated verdict for *this* release, checked against production misses |

Analysis is designed to start from **results alone** (framework-agnostic), then deepen over time with source text and judgment — so pilots do not depend on knowing every test framework on day one.

### 5.3 Decide (human in the loop)

- A bounded **Today** queue: what needs attention now, with estimated time cost  
- Architect **decisions** with reasons that control how widely they apply  
- Nothing is silently suppressed — hidden items stay one click away with reason and origin  
- The architect can always overrule DryDock, on the record  

### 5.4 Record (release artifact)

- **Sign-off** captures what was verified, what was not, what is known unreliable, and the call  
- **Misses** (production defects the suite should have caught) tune confidence over time  
- Misses are framed as **suite** failures, never as a person’s failure  

---

## 6. Product surfaces (what users see)

Two complementary stories live in one product:

### A. Test trust (QA Architect loop)

| Surface | Role |
|---------|------|
| **Tests** | Inventory of tests and whether each looks trustworthy |
| **Today** | Bounded attention queue |
| **Conventions** | Approved patterns for how tests should be written here |
| **Sign-off** | Signed release decision |
| **Misses** | Production bugs used to check whether advice matched reality |

**Loop:** Ingest → Tests → Today → Decision → Sign-off  

### B. Overview (engineering leadership)

Landing experience at `/dashboard`: delivery confidence, pillar views (Delivery / Code / QA / Compliance and related), attention items, and leadership approvals — Connexus-style Overview shell.

**Productivity** (`/productivity`) is a separate EM surface for per-contributor delivery metrics. It is the **only** place DryDock ranks people; Overview and test-trust stay team/project-scoped and evidence-linked to files and PRs, not individuals.

---

## 7. Architecture principles (safe marketing claims)

These are product invariants. Marketing can treat them as trust differentiators:

1. **Advise only** — DryDock informs; humans decide. It never blocks the pipeline.  
2. **Evidence for every claim** — Inference is labelled; numbers drill to raw material.  
3. **Nothing silently suppressed** — Hidden findings remain reachable with reason and decision.  
4. **Architect can overrule** — Disagreement is a first-class input, on the record.  
5. **Trust as a count, not a score** — On test surfaces: how many tests give real signal. Overview may show a composite delivery-confidence score.  
6. **Blame-free misses** — A production miss is a suite failure, used to calibrate the system.  
7. **Instrument voice** — Plain English, evidentiary tone — not chatbot personality.  
8. **Tenant isolation** — All data scoped by organization from session.  

---

## 8. What to say vs what to avoid

| Prefer | Avoid |
|--------|--------|
| “Which greens are trustworthy” | “AI that replaces your QA Architect” |
| “Defensible release sign-off” | “Auto-approves releases” |
| “Bounded attention queue” | “Yet another metrics dashboard” |
| “Evidence-backed recommendations” | “Black-box quality score for people” |
| “Works with your existing CI & Jira” | “Requires rewriting your test stack” |
| “You stay in control” | “Blocks CI until DryDock is happy” |

---

## 9. One-slide architecture summary

```text
Sources          DryDock core              Decisions
────────         ────────────              ─────────
GitHub CI   →    Trust · Conventions  →    Today queue
Jira        →    Coverage · Confidence →   Sign-off
                     ↑                         │
                     └──── Misses / learning ──┘

Promise: advise only · evidence always · nothing silently hidden
```

---
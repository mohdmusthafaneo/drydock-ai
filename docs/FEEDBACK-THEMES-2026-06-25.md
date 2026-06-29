# 10 Feedback Items — 4 Themes

> Customer feedback, grouped into themes, with suggested sequencing and open decisions.

---

## Themes

### 1. AI code accountability — *Large build*

Link commits to Jira tickets, score completion vs. requirements, flag risky "AI junk," and show who's accountable. We detect AI attribution today but don't link to tickets or assess quality/risk yet.

### 2. Compliance & governance — *Large / Medium*

Continuous compliance monitoring with custom rules per project, run by a background agent. We have org-level governance posture and agent infrastructure, but no rule engine or compliance agent yet.

### 3. Data trust & calibration — *Medium / Large*

Warn leadership when Jira isn't maintained properly; on onboarding, calibrate to each project's real workflow using 90 days of history (not one-size-fits-all). Partial coverage today on overdue tickets; no hygiene scoring or calibration pass yet.

### 4. Smarter intelligence — *Mixed (one small win, one big bet)*

Track spillover / reopened tickets as planning signals; predict problems before they happen; replace templated dashboard copy with AI-generated summaries. Descriptive analytics exist; predictive layer doesn't. AI headlines are the quickest win.

---

## Suggested sequencing

- **Trust first** — Jira calibration → hygiene warnings (everything else depends on reliable Jira data).
- **Compliance stack** — Per-project rules → continuous checks → background agent.
- **AI code stack** — Ticket linkage + risk scoring → accountability / cost tracking.
- **Quick win** — LLM dashboard headlines while we scope the bigger items.

---

## Open decisions for us

- Project-scoped vs org-scoped governance.
- LLM cost model.
- How aggressively we gate / discount scores when data quality is poor.
- What accountability info we show to whom.
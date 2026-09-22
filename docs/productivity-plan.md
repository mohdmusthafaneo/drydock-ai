# Productivity — feature plan

**Status:** Approved for build (locked decisions below).
**Date:** 2026-09-22
**Visual target:** [`docs/design/productivity-mockup.png`](design/productivity-mockup.png)

Per-contributor delivery metrics for Engineering Managers at `/productivity`. Built from a
purpose-built mock dataset. Invariant 1 is revoked for this surface only
(`docs/DRYDOCK-CONCEPT.md` §12).

---

## Locked decisions

| Decision | Choice |
|----------|--------|
| Invariant 1 | Revoked **only** on `/productivity`. Test-trust + Overview stay person-free. |
| Role gate | **None.** Every signed-in user sees the full page. |
| Intent / coaching banner | **None** on the page. |
| Guardrails (small-N, no default rank, cohort-relative) | **Deferred.** Plain ranked metrics in v1. |
| Composite person score | **Never.** |
| Data source | Mock store only. Existing Mastra/Prisma productivity pipeline stays for briefing + executive deck; the page ignores it. |
| Agent “Productivity” freshness / claim hrefs | Repointed to `/briefing` so the pipeline does not advertise this page. |

---

## Page layout (top → bottom)

1. **KPI strip** — team totals: PRs merged, median cycle time, median time to first review, reviews given — each with prior-sprint delta.
2. **Contributor table** — ranked, sortable, expandable PR drill-down. Default sort: PRs merged descending. Columns: rank, contributor, PRs merged, tickets worked, SP done, skipped (tickets · points), med. cycle, med. first review, reviews given, med. review turnaround, lines net, unreviewed %, AI mix.
3. **Throughput trend** + **Review load** — side by side (`AreaTrendChart` + horizontal bars).

No intent banner, no role-gate chrome, no composite person score.

---

## Data

- Generator: `scripts/generate-productivity-mock.ts` → `src/lib/store/mock/productivity-derived.ts`
- TPT: 10–12 contributors across 4 teams; Connexus: 4–5 on one team
- ~130 PRs + review events across the four existing sprints
- Per-contributor ticket activity: tickets worked, story points completed, tickets/SP skipped
- Static contributor identity map (no runtime resolution yet)
- Store: `Dimensioned<ProductivitySnapshot>` via `pick(team, sprint)`

---

## Navigation

- `nav.productivity: true` + section tab after Delivery
- `/productivity` in `usesConnexusChrome()`

---

## Out of scope this phase

Live adapters, API routes, identity-resolution service, role-gate plumbing, small-N
suppression, statement-of-intent copy.

# Area classifier — keyword table

`scripts/analyze_git.py:AREA_KEYWORDS` maps commit subjects to feature areas. The first match wins.

## Two-pass strategy

1. **Scope extraction.** If the subject starts with `<type>(scope): …`, the area is `scope:<scope>`. This is the most precise signal — trust it.
2. **Keyword fallback.** If no scope, scan the subject for keywords in the order below.

## Order matters

The list is checked top-down; the first regex that matches wins. Add new keywords **below** more specific ones so they don't accidentally swallow high-signal matches.

## Current keyword table

| Order | Area | Regex (case-insensitive) |
|---|---|---|
| 1 | `ai-agents/mastra` | `\b(mastra\|ai[- ]?agents?/m)\b` |
| 2 | `ai-agents` | `\b(agent\|ai[- ]?agent)\b` |
| 3 | `jira-integration` | `\bjira\b` |
| 4 | `github-integration` | `\bgithub\b` |
| 5 | `observability` | `\b(grafana\|prometheus\|observ)\b` |
| 6 | `delivery-analysis` | `\b(delivery\|dna)\b` |
| 7 | `code-analysis` | `\bcode[- ]?analysis\b` |
| 8 | `governance` | `\b(governance\|toolchain\|compliance\|policy)\b` |
| 9 | `workflow` | `\bworkflow\b` |
| 10 | `ui/design` | `\b(dashboard\|redesign\|design\|ui\|ux)\b` |
| 11 | `infra/scaling` | `\b(docker\|postgres\|pg[- ]?boss\|jsonb\|http\|pgvector\|cost[- ]?governor\|evidence\|timescale\|valkey\|worker\|read[- ]?replica\|migration\|prisma)\b` |
| 12 | `ci/cd` | `\b(ci\|coolify\|deploy)\b` |
| 13 | `docs` | `^docs` |
| 14 | `chore` | `^chore` |
| 15 | `fix` | `^fix` |
| 16 | `feat` | `^feat` |
| 17 | `refactor` | `^refactor` |
| 18 | `perf` | `^perf` |
| 19 | `test` | `^test` |

Anything that doesn't match falls into `other`.

## Adding a new area

1. Decide where in the priority list it belongs. More specific > more general.
2. Add the regex to `AREA_KEYWORDS` in `scripts/analyze_git.py`.
3. Add a row to the table above.
4. Re-run the analyzer and verify the new area captures the commits you expect.
5. Add an eval case to `evals/evals.json` if you want regression coverage.

## Why not ML?

Keyword classification is deterministic, fast, and explainable. The 19 rules above catch >95% of commits on a typical conventional-commit repo. ML would add a dependency and make debugging harder — not worth it.
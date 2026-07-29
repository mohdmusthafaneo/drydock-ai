---
name: analyze-git
description: "Generate a CTO-grade productivity report from a git branch as a structured JSON object. Use this skill whenever the user asks to analyze git history, commit cadence, contributor productivity, code churn, or merge patterns — for any branch, in any repo. Triggers on phrases like 'analyze this branch', 'productivity report', 'who's committing what', 'commit cadence', 'lines of code per author', 'merge report', or 'git stats for <branch>'. Output is a single JSON object containing headline numbers, per-author stats, per-area breakdown, weekly/weekday/hourly distributions, risks, and recommendations."
license: MIT
metadata:
  author: AIDOS CTO Office
  version: "1.0.0"
  repository: local
---

# analyze-git

Turn a git branch into a structured productivity report. The skill owns the entire pipeline: data collection, parsing, aggregation, classification, and JSON serialization. The output is a single JSON file; narrative rendering is out of scope.

## When to use

Trigger this skill when the user asks any of:

- "Analyze the `dev` branch and give me a productivity report."
- "How many commits per author this quarter?"
- "What does our commit cadence look like?"
- "Who is shipping what? I need a report for management."
- "Generate a JSON productivity report for the last N days."

The skill is **not** for: code reviews, blame, bisect, or per-file change tracking. It is intentionally scoped to branch-level, commit-level, and author-level aggregates.

## Why this skill exists

Parsing `git log` output is full of sharp edges:

1. **Format + numstat don't align by line.** `git log --format=... --shortstat` emits the format line, a blank line, then the shortstat — so the shortstat is at `idx+2`, not `idx+1`.
2. **Author names can collide with numstat parsing.** Names like `mohd123` match `\d+` regexes meant to detect file counts.
3. **Binary files appear as `-` `-` in numstat.** Must be filtered.
4. **The root commit has no parent.** `git diff-tree -r <root>` returns empty; use `--numstat` instead.
5. **`splitlines()` discards trailing blanks**, offsetting indices if you assume contiguous lines.
6. **Lockfiles (`package-lock.json`) and generated code (`src/generated/**`)** inflate churn counts and LOC; must be caveat'd.
7. **Conventional-commit scopes vs free-form subjects** need two different categorization strategies.
8. **`main` may be stale**; always compare against the active integration branch, not the bootstrap.

The bundled script (`scripts/analyze_git.py`) handles all of this. **Do not re-derive parsing logic in the agent.**

## What you produce
A single JSON file at `<repo>/analyze-git-report.json` (or any path the user specifies). The JSON schema is documented in [`references/json-schema.md`](references/json-schema.md).

## Quick start (Mastra workspace / sandbox)

Skill scripts live in this package. The sandbox can only execute them after the analyzer is materialized onto the workspace filesystem — **without** the model re-emitting the ~23k Python source (that hits output-token limits).

### Agent runbook (required)

1. Activate this skill: `skill` with `name: "analyze-git"`.
2. Materialize the analyzer with **`materializeAnalyzeGitTool`** (no args). It copies `scripts/analyze_git.py` → `tools/analyze_git.py` on disk.
3. **Do not** `skill_read` + `mastra_workspace_write_file` the script body. If `materializeAnalyzeGitTool` fails, recover with a host-side copy into `tools/analyze_git.py` — still never paste the Python source into a write_file `content` argument.
4. Run against the cloned repo (absolute path or `cwd` of the clone):

```bash
python3 tools/analyze_git.py \
    --repo /absolute/path/to/cloned/repo \
    --branch dev \
    --since "8 weeks ago" \
    --out /absolute/path/to/cloned/repo/analyze-git-report.json
```

If the workspace working directory is already the clone root, `--repo .` is fine.

If `git branch -a` shows only `remotes/origin/<name>` (no local branch), pass `--branch origin/<name>` (or check it out first). Do not invent a local branch name that git cannot resolve.

### Local CLI (human developers only)

From any machine that has this skill on disk:

```bash
python3 scripts/analyze_git.py \
    --repo /path/to/repo \
    --branch dev \
    --since "8 weeks ago" \
    --out analyze-git-report.json
```

(`scripts/analyze_git.py` is relative to this skill root.)

The script auto-detects:

- The repo root (uses `git rev-parse --show-toplevel`)
- All authors on the branch (no manual whitelist)
- Conventional-commit scopes (`feat(scope):`, `fix(scope):`)
- Free-form subject keywords (`mastra`, `jira`, `observability`, …)

## How the agent should use this skill

The expected interaction:

1. **User asks** "analyze branch X for productivity."
2. **Agent** calls `materializeAnalyzeGitTool`, then runs the script (see runbook above).
3. **Agent runs** `python3 tools/analyze_git.py --repo <clone> --branch X ...`.
4. **Agent** confirms the report path + a one-line headline (commits, contributors). Do not dump the full JSON into chat.

Do **not**:

- Paste `scripts/analyze_git.py` through `mastra_workspace_write_file` / `skill_read` — use `materializeAnalyzeGitTool`.
- Invent absolute host paths for the skill script — use the runbook above.
- Reimplement git parsing in the agent. Use the script.
- Modify the script content when materializing it.
- Add ad-hoc fields to the JSON. Extend the schema in [`references/json-schema.md`](references/json-schema.md) instead.
- Run `git log` more than once per branch — the script handles batching.
- Render Markdown or any other derived format from the JSON. The JSON is the deliverable.


## Output schema (summary)

Top-level keys in the JSON:

| Key | Type | Purpose |
|---|---|---|
| `report` | object | Metadata: branch, window, source, headline TL;DR |
| `headline` | object | Single-number KPIs (commits, files, +/−lines, ratios) |
| `contributors` | array | Per-author: commits, files, +/−lines, net |
| `commit_type_breakdown` | array | Conventional-commit type counts and shares |
| `weekly_volume` | array | ISO week → commit count |
| `weekday_distribution` | object | Mon–Sun → commit count |
| `hour_distribution_ist` | object | 24h bucket → commit count |
| `productivity_by_area` | array | Area → commits/files/+−lines/net |
| `largest_commits` | array | Top 15 by +lines |
| `commit_size_distribution_added_lines` | array | Bucket → count |
| `branching_and_delivery` | object | PR merges, branch divergence, review state |
| `what_went_well` | array of strings | 3–5 bullets |
| `risks` | array of objects | 3–6 risk bullets |
| `recommendations` | array of objects | 3–6 numbered action items |
| `methodology_and_caveats` | object | Data sources, exclusions, signal quality |

Full field-level schema: [`references/json-schema.md`](references/json-schema.md).

## Area classification

The script uses a two-pass classifier on each commit's subject:

1. **Scope extraction** — `feat(scope):`, `fix(scope):`, etc. → `scope:<name>`.
2. **Keyword fallback** — keywords like `mastra`, `jira`, `grafana`, `dashboard`, `infra`, `ci`, `docs`, `governance`, etc.

Customization is in `scripts/analyze_git.py` (`classify_area`). Add new keywords there, not in the agent.

## Excluding noise

The script automatically:

- Skips merge commits for per-author +/− line stats (but counts them in totals).
- Skips binary file diffs (`-` `-` rows).
- Tags `package-lock.json` and `src/generated/**` so they can be filtered or caveated in the narrative.
- Reports both **raw LOC** and **product-code LOC** (excluding generated) in `headline`.

## Decision points for downstream consumers

The JSON's numeric signals map to common interpretations:

| Observation in JSON | Implication |
|---|---|
| `feat_fix_ratio < 1` | More bug-fixes than features — quality concern. |
| `feat_fix_ratio > 5` | Possibly under-investing in tests/refactor. |
| `refactor + test` commit share < 5% | Quality signals weak. |
| Single author > 90% | Bus factor = 1. |
| `dev_ahead_of_main_commits > 100` | `main` is stale; release blocked. |
| `lines_deleted / lines_added < 0.20` | Codebase growing without cleanup. |
| Cadence drops 50%+ in last 7 days | Investigate slowdown. |

## Files in this skill

| Path | Purpose |
|---|---|
| `SKILL.md` | This file. |
| `scripts/analyze_git.py` | The main analyzer. Single-source-of-truth for parsing. |
| `scripts/__init__.py` | Package marker. |
| `references/json-schema.md` | Full field-level schema for the JSON output. |
| `references/area-keywords.md` | Keyword table for the area classifier. |
| `references/error-recipes.md` | Recoveries for the top 10 things that go wrong. |
| `assets/sample-output.json` | A complete example output, for reference. |

## Versioning

The schema is stable. New fields are additive; renaming a field is a breaking change and bumps the major version in `metadata.version`.

## License

MIT.
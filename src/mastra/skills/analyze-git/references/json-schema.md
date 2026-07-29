# JSON Schema — `analyze_git.py` output

The analyzer emits a single JSON object with the top-level keys below. All keys are always present; arrays may be empty.

## `report` (object)

| Field | Type | Notes |
|---|---|---|
| `title` | string | `"Git productivity report — branch <name>"` |
| `branch_analyzed` | string | The branch passed via `--branch`. |
| `comparison_branch` | string\|null | Always `"main"` unless the analyzed branch is `main`. |
| `window.first_commit` | string (YYYY-MM-DD) | Date of the oldest commit. |
| `window.last_commit` | string (YYYY-MM-DD) | Date of the newest commit. |
| `window.calendar_days` | int | Inclusive days in window. |
| `window.active_days` | int | Distinct calendar days with ≥1 commit. |
| `window.active_iso_weeks` | int | Distinct ISO weeks with ≥1 commit. |
| `data_source` | string | Human-readable provenance. |
| `tl_dr` | string | Left empty by the script; the analyst agent fills it. |

## `headline` (object)

| Field | Type | Notes |
|---|---|---|
| `total_commits` | int | All commits on branch (incl. merges). |
| `merge_commits` | int | |
| `non_merge_commits` | int | |
| `files_touched` | int | Sum of `files_changed` across commits. |
| `lines_added_raw` | int | Across all files (incl. lockfiles, generated). |
| `lines_deleted_raw` | int | Same. |
| `lines_added_product` | int | Excludes lockfiles + generated dirs. |
| `lines_deleted_product` | int | Same. |
| `net_growth_raw` | int | `lines_added_raw - lines_deleted_raw`. |
| `net_growth_product` | int | Product-only net. |
| `prs_merged` | int | Count of `Merge pull request #N` commits. |
| `active_days` | int | |
| `calendar_days` | int | |
| `avg_commits_per_active_day` | float | |
| `avg_commits_per_calendar_day` | float | |
| `median_commit.added` | int | Median non-merge commit in lines added. |
| `median_commit.deleted` | int | |
| `mean_commit.added` | int | |
| `mean_commit.deleted` | int | |
| `p90_commit_added` | int | 90th percentile of `added` across non-merge commits. |
| `max_commit_added` | int | |
| `feat_fix_ratio` | float | `feat_count / max(fix_count, 1)`. |

## `contributors` (array)

Each entry:

```json
{
  "author": "mohdmusthafaneo",
  "commits": 155,
  "share_pct": 97.5,
  "files": 2095,
  "lines_added": 144276,
  "lines_deleted": 29703,
  "net": 114573
}
```

Sorted by `commits` descending.

## `commit_type_breakdown` (array)

```json
{ "type": "feat", "count": 84, "share_pct": 60.4 }
```

Types: `feat`, `fix`, `ci`, `docs`, `chore`, `refactor`, `perf`, `test`, `merge`, `other`.

## `weekly_volume` (array)

```json
{ "iso_week": "2026-W21", "commits": 2 }
```

Sorted by ISO week ascending.

## `weekday_distribution` (object)

Keys: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`. Values: integer commit counts.

## `hour_distribution_ist` (object)

Keys: `"00:00"`, `"01:00"`, …, `"23:00"`. Values: commit counts. Hour is taken from the commit timestamp in IST (+05:30).

## `productivity_by_area` (array)

Each entry:

```json
{
  "area": "ai-agents",
  "commits": 15,
  "files": 508,
  "added": 25487,
  "deleted": 15721,
  "net": 9766
}
```

Sorted by `commits` descending. Areas come from `classify_area()` in the script; see `area-keywords.md`.

## `largest_commits` (array)

Top 15 non-merge commits by `added` lines. Each entry:

```json
{
  "sha": "e311b86e7f3e2a1b9c0d3f4e5a6b7c8d9e0f1234",
  "date": "2026-05-21",
  "author": "Suralal",
  "subject": "Initial commit: AIDOS governance-aware operational intelligence...",
  "files": 528,
  "added": 33829,
  "deleted": 0
}
```

## `commit_size_distribution_added_lines` (array)

```json
[
  { "bucket": "<10", "count": 21 },
  { "bucket": "10-49", "count": 19 },
  { "bucket": "50-99", "count": 1 },
  { "bucket": "100-249", "count": 10 },
  { "bucket": "250-499", "count": 19 },
  { "bucket": "500-999", "count": 23 },
  { "bucket": "1000+", "count": 46 }
]
```

## `branching_and_delivery` (object)

| Field | Type | Notes |
|---|---|---|
| `dev_ahead_of_main_commits` | int | `git rev-list --count main..dev`. |
| `main_ahead_of_dev_commits` | int | `git rev-list --count dev..main`. |
| `prs_merged` | int | |
| `remote_branch_count` | int | |
| `remote_branches` | array of strings | First 20 remote branch names. |

## `what_went_well` (array of strings)

Empty by default. The agent fills this from observations about the JSON.

## `risks` (array of objects)

Empty by default. The agent fills:

```json
{ "title": "Bus factor = 1", "detail": "All commits come from one author." }
```

## `recommendations` (array of objects)

Empty by default. The agent fills:

```json
{ "title": "Promote dev to main", "detail": "Cut a v0.x tag and start shipping." }
```

## `methodology_and_caveats` (object)

| Field | Type | Notes |
|---|---|---|
| `data_source` | string | |
| `exclusions.noisy_files` | string | |
| `exclusions.generated_dirs` | string | |
| `loc_note` | string | |
| `strongest_signals` | array | |
| `weakest_signals` | array | |

## Stability guarantee

- The JSON shape is stable. New fields may be added; existing fields are not renamed or repurposed.
- Any breaking change bumps `metadata.version` to the next major in `SKILL.md`.
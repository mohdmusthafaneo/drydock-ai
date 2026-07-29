#!/usr/bin/env python3
"""
analyze_git.py — branch-level git productivity analyzer → structured JSON.

Parsing pitfalls handled here (do not re-derive in the agent):
  shortstat at idx+2 after blank line; binary numstat `-` `-`; root commit via
  --numstat; noisy lockfiles/generated paths; conventional-commit scopes.

Usage:
    python3 analyze_git.py --repo . --branch dev --out report.json
    python3 analyze_git.py --repo . --branch main --since "30 days ago" --pretty

Mastra agents: call materializeAnalyzeGitTool, then run tools/analyze_git.py.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from statistics import mean, median
from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Sentinel must contain at least one `%`-placeholder so git accepts the
# --format string, but the literal prefix must be unique enough to never
# appear in commit subjects. Plain `===ANALYZE_GIT===` works — chosen because
# `+` alone is rejected by git, and `%x00` (null bytes) crashes Python's
# subprocess on 3.14+ ("embedded null byte" error).
SENTINEL = "===ANALYZE_GIT==="  # prefix used standalone in --pretty
# For --format: keep a single delimiter between fields; do NOT include a trailing
# delimiter right before the closing sentinel, otherwise the trailing empty part
# ends up in the subject and breaks downstream parsing.
SENTINEL_FMT = "===ANALYZE_GIT===%H|%ai|%an|%s===ANALYZE_GIT==="  # for --format

# Files we tag as "noisy" so the narrative can caveat them.
NOISY_PATH_PATTERNS = [
    re.compile(r"package-lock\.json$"),
    re.compile(r"yarn\.lock$"),
    re.compile(r"pnpm-lock\.yaml$"),
    re.compile(r"src/generated/"),
]

# Conventional-commit type detection.
TYPE_PATTERNS = [
    ("merge",   re.compile(r"^merge\b", re.I)),
    ("feat",    re.compile(r"^feat[\(:]?", re.I)),
    ("fix",     re.compile(r"^fix[\(:]?", re.I)),
    ("chore",   re.compile(r"^chore[\(:]?", re.I)),
    ("docs",    re.compile(r"^docs[\(:]?", re.I)),
    ("ci",      re.compile(r"^ci[\(:]?", re.I)),
    ("refactor",re.compile(r"^refactor[\(:]?", re.I)),
    ("perf",    re.compile(r"^perf[\(:]?", re.I)),
    ("test",    re.compile(r"^test[\(:]?", re.I)),
]

# Area classifier: ordered — first match wins.
AREA_KEYWORDS: list[tuple[str, re.Pattern]] = [
    ("scope",          re.compile(r"^[a-z]+\(([^)]+)\):", re.I)),
    ("ai-agents/mastra", re.compile(r"\b(mastra|ai[- ]?agents?/m)\b", re.I)),
    ("ai-agents",      re.compile(r"\b(agent|ai[- ]?agent)\b", re.I)),
    ("jira-integration", re.compile(r"\bjira\b", re.I)),
    ("github-integration", re.compile(r"\bgithub\b", re.I)),
    ("observability",  re.compile(r"\b(grafana|prometheus|observ)\b", re.I)),
    ("delivery-analysis", re.compile(r"\b(delivery|dna)\b", re.I)),
    ("code-analysis",  re.compile(r"\bcode[- ]?analysis\b", re.I)),
    ("governance",     re.compile(r"\b(governance|toolchain|compliance|policy)\b", re.I)),
    ("workflow",       re.compile(r"\bworkflow\b", re.I)),
    ("ui/design",      re.compile(r"\b(dashboard|redesign|design|ui|ux)\b", re.I)),
    ("infra/scaling",  re.compile(r"\b(docker|postgres|pg[- ]?boss|jsonb|http|pgvector|cost[- ]?governor|evidence|timescale|valkey|worker|read[- ]?replica|migration|prisma)\b", re.I)),
    ("ci/cd",          re.compile(r"\b(ci|coolify|deploy)\b", re.I)),
    ("docs",           re.compile(r"^docs", re.I)),
    ("chore",          re.compile(r"^chore", re.I)),
    ("fix",            re.compile(r"^fix", re.I)),
    ("feat",           re.compile(r"^feat", re.I)),
    ("refactor",       re.compile(r"^refactor", re.I)),
    ("perf",           re.compile(r"^perf", re.I)),
    ("test",           re.compile(r"^test", re.I)),
]


# ---------------------------------------------------------------------------
# Git invocation helpers
# ---------------------------------------------------------------------------

def git(repo: Path, *args: str) -> str:
    """Run a git command, return stdout. Raises on non-zero exit."""
    cmd = ["git", "-C", str(repo)] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def git_numstat(repo: Path, branch: str, since: str | None, include_merges: bool) -> list[tuple[str, int, int]]:
    """
    Walk all commits on `branch` and return (path, added, deleted) per file.

    Binary files (numstat `-` `-`) are filtered out. Root commit is included.
    """
    cmd = ["log", branch, "--numstat", f"--format={SENTINEL_FMT}"]
    if not include_merges:
        cmd.append("--no-merges")
    if since:
        cmd.append(f"--since={since}")
    out = git(repo, *cmd)
    rows: list[tuple[str, int, int]] = []
    for line in out.splitlines():
        if line == SENTINEL:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        a, d, path = parts[0], parts[1], parts[2]
        if a == "-" or d == "-":
            continue  # binary
        rows.append((path, int(a), int(d)))
    return rows


def git_log_format(repo: Path, branch: str, since: str | None,
                   include_merges: bool, with_shortstat: bool) -> list[dict[str, Any]]:
    """
    Walk all commits and return structured dicts with author/date/subject +
    (optionally) added/deleted/files.

    Uses SENTINEL delimiters in --format so we can re-sync after parsing errors.
    """
    fmt = SENTINEL_FMT
    cmd = ["log", branch, f"--format={fmt}"]
    if not include_merges:
        cmd.append("--no-merges")
    if since:
        cmd.append(f"--since={since}")
    if with_shortstat:
        cmd.append("--shortstat")
    out = git(repo, *cmd)

    rows: list[dict[str, Any]] = []
    lines = out.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line.startswith(SENTINEL):
            i += 1
            continue
        # Inner content between the two sentinels
        # Format: ===ANALYZE_GIT===sha|date|author|subject|===ANALYZE_GIT===
        # Strip the closing sentinel, then split on `|` max 4 splits so the
        # subject keeps any `|` characters it may contain.
        inner = line[len(SENTINEL):]
        if inner.endswith(SENTINEL):
            inner = inner[:-len(SENTINEL)]
        # inner is now: "sha|date|author|subject"
        parts = inner.split("|", 3)
        if len(parts) < 4:
            i += 1
            continue
        sha, dt, author, subject = parts

        added = deleted = files_changed = 0
        if with_shortstat:
            # shortstat appears at i+2 (i+1 is a blank line). Look ahead.
            for j in (i + 1, i + 2, i + 3):
                if j >= len(lines):
                    break
                nxt = lines[j]
                if "changed" not in nxt:
                    continue
                m_files = re.search(r"(\d+) files? changed", nxt)
                if m_files:
                    files_changed = int(m_files.group(1))
                m_add = re.search(r"(\d+) insertions?", nxt)
                if m_add:
                    added = int(m_add.group(1))
                m_del = re.search(r"(\d+) deletions?", nxt)
                if m_del:
                    deleted = int(m_del.group(1))
                break

        rows.append({
            "sha": sha,
            "date": dt[:10],
            "author": author,
            "subject": subject,
            "added": added,
            "deleted": deleted,
            "files_changed": files_changed,
        })
        i += 1
    return rows


def git_log_branches(repo: Path) -> list[str]:
    """List local branches."""
    out = git(repo, "branch", "--format=%(refname:short)")
    return [l.strip() for l in out.splitlines() if l.strip()]


def git_log_remote_branches(repo: Path, remote: str = "origin") -> list[str]:
    """List remote-only branches."""
    out = git(repo, "branch", "-r", "--format=%(refname:short)")
    return [l.strip() for l in out.splitlines() if l.strip().startswith(f"{remote}/")]


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify_commit_type(subject: str) -> str:
    sl = subject.lower()
    for name, pat in TYPE_PATTERNS:
        if pat.match(sl):
            return name
    return "other"


def classify_area(subject: str) -> str:
    """Map a commit subject to a feature area. First-match-wins."""
    m = re.match(r"^[a-z]+\(([^)]+)\):", subject, re.I)
    if m:
        return f"scope:{m.group(1).lower()}"
    for name, pat in AREA_KEYWORDS[1:]:  # skip the scope one we already tried
        if pat.search(subject):
            return name
    return "other"


def is_noisy_path(path: str) -> bool:
    return any(p.search(path) for p in NOISY_PATH_PATTERNS)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def build_report(repo: Path, branch: str, since: str | None,
                 include_merges: bool) -> dict[str, Any]:
    # Always fetch ALL commits (incl. merges) for accurate totals; the
    # --no-merges flag is dropped from this call because the headline numbers
    # need merges counted. Per-author +/− line aggregation below filters out
    # merges explicitly so we don't double-count merge commits' diffs.
    all_commits = git_log_format(repo, branch, since, include_merges=True, with_shortstat=True)
    numstat_rows = git_numstat(repo, branch, since, include_merges=include_merges)
    commits = all_commits

    if not commits:
        raise RuntimeError(f"No commits found on branch {branch!r}")

    # Window
    first = commits[-1]["date"]
    last = commits[0]["date"]
    f = date.fromisoformat(first)
    l = date.fromisoformat(last)
    span_days = (l - f).days + 1
    active_days = len({c["date"] for c in commits})

    # Compute non_merge FIRST so we can use it for both commit-type breakdown
    # AND per-author +/- line aggregation (merges duplicate PR diffs).
    non_merge = [c for c in commits if not c["subject"].lower().startswith("merge")]

    # Per-author stats: only non-merge commits count toward +/- lines.
    # Total commit counts (including merges) live in `contributors_commits`
    # below — that list mirrors `commits` so merges are still counted.
    author_commits: Counter[str] = Counter()
    author_files: Counter[str] = Counter()
    author_added: Counter[str] = Counter()
    author_deleted: Counter[str] = Counter()
    for c in non_merge:
        author_commits[c["author"]] += 1
        author_files[c["author"]] += c["files_changed"]
        author_added[c["author"]] += c["added"]
        author_deleted[c["author"]] += c["deleted"]

    contributors = []
    total_commits_all = sum(c for c in author_commits.values())
    for author, n in author_commits.most_common():
        contributors.append({
            "author": author,
            "commits": n,
            "share_pct": round(100 * n / total_commits_all, 1),
            "files": author_files[author],
            "lines_added": author_added[author],
            "lines_deleted": author_deleted[author],
            "net": author_added[author] - author_deleted[author],
        })

    # Commit types (non-merge only)
    type_counts: Counter[str] = Counter()
    for c in non_merge:
        type_counts[classify_commit_type(c["subject"])] += 1
    type_breakdown = [
        {
            "type": t,
            "count": n,
            "share_pct": round(100 * n / max(len(non_merge), 1), 1),
        }
        for t, n in type_counts.most_common()
    ]

    # Weekly, weekday counters (hour is filled by a separate query below).
    weekly: Counter[str] = Counter()
    weekday: Counter[int] = Counter()
    hour: Counter[int] = Counter()
    for c in commits:
        dt = datetime.strptime(c["date"] + " 00:00:00", "%Y-%m-%d %H:%M:%S")
        yr, wk, _ = dt.isocalendar()
        weekly[f"{yr}-W{wk:02d}"] += 1
        weekday[dt.weekday()] += 1

    # Hour distribution requires full datetime. Run a separate query.
    fmt = SENTINEL_FMT
    cmd = ["log", branch, f"--format={fmt}"]
    if not include_merges:
        cmd.append("--no-merges")
    if since:
        cmd.append(f"--since={since}")
    hour_out = git(repo, *cmd)
    for line in hour_out.splitlines():
        if not line.startswith(SENTINEL):
            continue
        inner = line[len(SENTINEL):]
        if inner.endswith(SENTINEL):
            inner = inner[:-len(SENTINEL)]
        # Format is: sha|date|author|subject (date comes from %ai, includes timezone).
        # Split with max=3 so the subject can contain `|` characters.
        parts = inner.split("|", 3)
        if len(parts) < 4:
            continue
        dt_str = parts[1][:19]  # "YYYY-MM-DD HH:MM:SS"
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        hour[dt.hour] += 1

    # Productivity by area (non-merge)
    area_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"commits": 0, "files": 0, "added": 0, "deleted": 0})
    for c in non_merge:
        a = classify_area(c["subject"])
        area_stats[a]["commits"] += 1
        area_stats[a]["files"] += c["files_changed"]
        area_stats[a]["added"] += c["added"]
        area_stats[a]["deleted"] += c["deleted"]

    productivity_by_area = [
        {
            "area": a,
            "commits": s["commits"],
            "files": s["files"],
            "added": s["added"],
            "deleted": s["deleted"],
            "net": s["added"] - s["deleted"],
        }
        for a, s in sorted(area_stats.items(), key=lambda kv: -kv[1]["commits"])
        if s["commits"] > 0
    ]

    # Largest commits (non-merge, by +lines)
    largest = sorted(non_merge, key=lambda c: -c["added"])[:15]
    largest_commits = [
        {
            "sha": c["sha"],
            "date": c["date"],
            "author": c["author"],
            "subject": c["subject"][:80],
            "files": c["files_changed"],
            "added": c["added"],
            "deleted": c["deleted"],
        }
        for c in largest
    ]

    # Commit size distribution
    size_buckets = Counter()
    for c in non_merge:
        a = c["added"]
        if a < 10:        size_buckets["<10"] += 1
        elif a < 50:      size_buckets["10-49"] += 1
        elif a < 100:     size_buckets["50-99"] += 1
        elif a < 250:     size_buckets["100-249"] += 1
        elif a < 500:     size_buckets["250-499"] += 1
        elif a < 1000:    size_buckets["500-999"] += 1
        else:             size_buckets["1000+"] += 1

    size_distribution = [
        {"bucket": k, "count": size_buckets[k]}
        for k in ["<10", "10-49", "50-99", "100-249", "250-499", "500-999", "1000+"]
    ]

    # Numstat: aggregate across all paths
    total_added = sum(r[1] for r in numstat_rows)
    total_deleted = sum(r[2] for r in numstat_rows)
    noisy_added = sum(r[1] for r in numstat_rows if is_noisy_path(r[0]))
    noisy_deleted = sum(r[2] for r in numstat_rows if is_noisy_path(r[0]))
    generated_added = sum(r[1] for r in numstat_rows if "/generated/" in r[0] or r[0].startswith("src/generated"))
    generated_deleted = sum(r[2] for r in numstat_rows if "/generated/" in r[0] or r[0].startswith("src/generated"))

    # Branching & delivery
    main_ahead = 0
    dev_ahead_of_main = 0
    try:
        main_ahead = int(git(repo, "rev-list", "--count", "dev..main").strip() or "0")
        dev_ahead_of_main = int(git(repo, "rev-list", "--count", "main..dev").strip() or "0")
    except RuntimeError:
        pass

    merge_pr_count = 0
    try:
        merge_out = git(repo, "log", branch, "--merges", "--pretty=%s")
        merge_pr_count = sum(1 for s in merge_out.splitlines() if "Merge pull request #" in s)
    except RuntimeError:
        pass

    remote_branches = git_log_remote_branches(repo)

    # Median / mean commit
    added_list = [c["added"] for c in non_merge]
    deleted_list = [c["deleted"] for c in non_merge]
    feat_count = type_counts.get("feat", 0)
    fix_count = type_counts.get("fix", 0)

    report = {
        "report": {
            "title": f"Git productivity report — branch {branch}",
            "branch_analyzed": branch,
            "comparison_branch": "main" if branch != "main" else None,
            "window": {
                "first_commit": first,
                "last_commit": last,
                "calendar_days": span_days,
                "active_days": active_days,
                "active_iso_weeks": len(weekly),
            },
            "data_source": "git log " + branch + " --format=... --shortstat --numstat; no external systems queried",
            "tl_dr": "",  # filled in by narrative agent
        },

        "headline": {
            "total_commits": len(commits),
            "merge_commits": sum(1 for c in commits if c["subject"].lower().startswith("merge")),
            "non_merge_commits": len(non_merge),
            "files_touched": sum(c["files_changed"] for c in commits),
            "lines_added_raw": total_added,
            "lines_deleted_raw": total_deleted,
            "lines_added_product": total_added - noisy_added - generated_added,
            "lines_deleted_product": total_deleted - noisy_deleted - generated_deleted,
            "net_growth_raw": total_added - total_deleted,
            "net_growth_product": (total_added - noisy_added - generated_added) - (total_deleted - noisy_deleted - generated_deleted),
            "prs_merged": merge_pr_count,
            "active_days": active_days,
            "calendar_days": span_days,
            "avg_commits_per_active_day": round(len(commits) / max(active_days, 1), 2),
            "avg_commits_per_calendar_day": round(len(commits) / max(span_days, 1), 2),
            "median_commit": {
                "added": int(median(added_list)) if added_list else 0,
                "deleted": int(median(deleted_list)) if deleted_list else 0,
            },
            "mean_commit": {
                "added": int(mean(added_list)) if added_list else 0,
                "deleted": int(mean(deleted_list)) if deleted_list else 0,
            },
            "p90_commit_added": int(sorted(added_list)[int(len(added_list) * 0.9)]) if added_list else 0,
            "max_commit_added": max(added_list) if added_list else 0,
            "feat_fix_ratio": round(feat_count / max(fix_count, 1), 2),
        },

        "contributors": contributors,

        "commit_type_breakdown": type_breakdown,

        "weekly_volume": [
            {"iso_week": w, "commits": weekly[w]}
            for w in sorted(weekly)
        ],

        "weekday_distribution": {
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]: weekday[i]
            for i in range(7)
        },

        "hour_distribution_ist": {
            f"{h:02d}:00": hour[h] for h in sorted(hour)
        },

        "productivity_by_area": productivity_by_area,

        "largest_commits": largest_commits,

        "commit_size_distribution_added_lines": size_distribution,

        "branching_and_delivery": {
            "dev_ahead_of_main_commits": dev_ahead_of_main,
            "main_ahead_of_dev_commits": main_ahead,
            "prs_merged": merge_pr_count,
            "remote_branch_count": len(remote_branches),
            "remote_branches": remote_branches[:20],
        },

        "methodology_and_caveats": {
            "data_source": f"git log {branch} --format=... --shortstat --numstat",
            "exclusions": {
                "noisy_files": "package-lock.json, yarn.lock, pnpm-lock.yaml",
                "generated_dirs": "src/generated/** (auto-generated Prisma client, etc.)",
            },
            "loc_note": "lines_added_product excludes noisy lockfiles and generated code; use that for net product-code growth.",
            "strongest_signals": ["bus_factor (contributors)", "refactor + test commit ratio", "weekly cadence trend"],
            "weakest_signals": ["raw LOC growth (greenfield projects always spike)"],
        },

        "what_went_well": [],
        "risks": [],
        "recommendations": [],
    }
    return report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Generate a git-branch productivity JSON report.")
    p.add_argument("--repo", default=".", help="Path to the git repo (default: cwd)")
    p.add_argument("--branch", required=True, help="Branch to analyze")
    p.add_argument("--since", default=None, help='Time filter, e.g. "30 days ago", "2026-01-01"')
    p.add_argument("--include-merges", action="store_true", help="Include merge commits in stats (default: include in totals, exclude from per-author lines)")
    p.add_argument("--out", default=None, help="Output JSON file path (default: stdout)")
    p.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    args = p.parse_args(argv)

    repo = Path(args.repo).resolve()
    if not (repo / ".git").exists():
        print(f"error: {repo} is not a git repository", file=sys.stderr)
        return 2

    report = build_report(repo, args.branch, args.since, args.include_merges)
    payload = json.dumps(report, indent=2 if args.pretty else None, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(payload + "\n", encoding="utf-8")
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
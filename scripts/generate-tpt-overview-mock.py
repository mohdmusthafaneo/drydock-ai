#!/usr/bin/env python3
"""Generate src/lib/store/mock/tpt-overview-derived.ts from a Jira CSV export.

Usage:
  python3 scripts/generate-tpt-overview-mock.py [path/to/tbt.csv]

Defaults to ~/Downloads/tbt.csv.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_TS = ROOT / "src/lib/store/mock/tpt-overview-derived.ts"
DEFAULT_CSV = Path.home() / "Downloads" / "tbt.csv"

TEAM_NAME_TO_KEY = {
    "Agile Avengers Team": "AVENGERS",
    "Apex Team": "APEX",
    "Dark Side Team": "DARK",
    "Mobile": "MOBILE",
}
TEAM_KEY_TO_NAME = {
    "AVENGERS": "Agile Avengers",
    "APEX": "Apex Team",
    "DARK": "Dark Side Team",
    "MOBILE": "Mobile",
}
TEAM_SPRINT_HINT = {
    "AVENGERS": ("avengers",),
    "APEX": ("apex",),
    "DARK": ("dark side",),
    "MOBILE": ("mobile",),
}
SCOPE_TYPES = {"Story", "Bug", "Feature", "Epic"}
SPRINTS = [
    # Calendar windows match TPT Jira sprint dates (times applied in derived labels).
    {"id": "27", "name": "Sprint 27", "start": date(2026, 8, 31), "end": date(2026, 9, 10), "active": True},
    {"id": "26", "name": "Sprint 26", "start": date(2026, 8, 17), "end": date(2026, 8, 28), "active": False},
    {"id": "25", "name": "Sprint 25", "start": date(2026, 8, 3), "end": date(2026, 8, 15), "active": False},
    {"id": "24", "name": "Sprint 24", "start": date(2026, 7, 20), "end": date(2026, 8, 1), "active": False},
]
SPRINT_BY_ID = {s["id"]: s for s in SPRINTS}
AS_OF = datetime(2026, 9, 8, 10, 49, 0)
AS_OF_DATE = AS_OF.date()
PREV_MAP = {"27": "26", "26": "25", "25": "24", "24": None}


def idxs(headers, name):
    return [i for i, h in enumerate(headers) if h == name]


def get(headers, row, name):
    i = headers.index(name)
    return row[i].strip() if i < len(row) else ""


def get_all(headers, row, name):
    return [row[i].strip() for i in idxs(headers, name) if i < len(row) and row[i].strip()]


def parse_dt(s):
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d/%b/%y %I:%M %p", "%d/%b/%Y %I:%M %p", "%d/%b/%y", "%d/%b/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


_VERSION_DATE_PAT = re.compile(r"(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{2,4})")
_VERSION_MON_PAT = re.compile(
    r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})",
    re.I,
)
_MONTH = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


def parse_version_date(name: str):
    """Best-effort target date from TPT fix-version names (mm-dd-yy or dd Mon yyyy)."""
    cleaned = name.replace(" -", "-").replace("- ", "-")
    m = _VERSION_DATE_PAT.search(cleaned)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = 2000 + y if y < 100 else y
        if a > 12:
            day, month = a, b
        elif b > 12:
            month, day = a, b
        else:
            month, day = a, b
        try:
            return date(y, month, day)
        except ValueError:
            return None
    m = _VERSION_MON_PAT.search(name)
    if m:
        day = int(m.group(1))
        month = _MONTH[m.group(2)[:3].lower()]
        y = int(m.group(3))
        y = 2000 + y if y < 100 else y
        try:
            return date(y, month, day)
        except ValueError:
            return None
    return None


def version_id(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return (slug or "version")[:48]


def sprint_num_from_raw(raw):
    name = raw
    m = re.search(r"name=([^,\]]+)", raw)
    if m:
        name = m.group(1).strip()
    m = re.search(r"Sprint\s+(\d+)\s*$", name, re.I)
    return (name, int(m.group(1))) if m else (name, None)


def issue_sprint_pairs(headers, row):
    out = []
    for s in get_all(headers, row, "Sprint"):
        name, num = sprint_num_from_raw(s)
        if num is not None:
            out.append((name, num))
    return out


def day_label(d: date) -> str:
    return f"{d.strftime('%b')} {d.day}"


def daterange(start: date, end: date):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def band_for(score: int) -> str:
    if score >= 80:
        return "Strong"
    if score >= 65:
        return "Steady"
    if score >= 45:
        return "Caution"
    return "At risk"


def tone_for(score: int) -> str:
    if score < 50:
        return "danger"
    if score < 65:
        return "warning"
    return "steady"


def clamp(n, lo=0, hi=100):
    return max(lo, min(hi, int(round(n))))


def soft_score(completion, blocked, spillover, bugs):
    score = completion - min(10, blocked * 0.6) - min(8, spillover * 0.12) - min(6, bugs / 25)
    score = max(score, completion - 15)
    return clamp(score)


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    with csv_path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = list(reader)

    parsed = []
    for r in rows:
        pairs = issue_sprint_pairs(headers, r)
        last = pairs[-1] if pairs else None
        labs = {l.lower() for l in get_all(headers, r, "Labels")}
        parsed.append(
            {
                "key": get(headers, r, "Issue key"),
                "summary": get(headers, r, "Summary"),
                "type": get(headers, r, "Issue Type"),
                "status": get(headers, r, "Status"),
                "priority": get(headers, r, "Priority"),
                "done": get(headers, r, "Status Category") == "Done",
                "blocked": bool(get(headers, r, "Custom field (Flagged)"))
                or bool(get_all(headers, r, "Inward issue link (Blocks)"))
                or bool(labs & {"needs-input", "blocked", "blocker"}),
                "team": TEAM_NAME_TO_KEY.get(get(headers, r, "Team Name")),
                "created": parse_dt(get(headers, r, "Created")),
                "resolved": parse_dt(get(headers, r, "Resolved")),
                "updated": parse_dt(get(headers, r, "Updated")),
                "due": parse_dt(get(headers, r, "Due date"))
                or parse_dt(get(headers, r, "Custom field (Due Date)")),
                "assignee": get(headers, r, "Assignee"),
                "story_points": get(headers, r, "Custom field (Story Points)")
                or get(headers, r, "Custom field (Story point estimate)"),
                "fix_versions": get_all(headers, r, "Fix versions"),
                "status_category": get(headers, r, "Status Category"),
                "last_name": last[0] if last else None,
                "last_num": last[1] if last else None,
                "in_scope": get(headers, r, "Issue Type") in SCOPE_TYPES,
            }
        )

    def team_matches(p, team_key):
        if p["team"] == team_key:
            return True
        if p["last_name"] and any(h in p["last_name"].lower() for h in TEAM_SPRINT_HINT[team_key]):
            return True
        return False

    def filter_committed(sprint_id, team_key=None):
        num = int(sprint_id)
        return [
            p
            for p in parsed
            if p["last_num"] == num
            and p["in_scope"]
            and (team_key is None or team_matches(p, team_key))
        ]

    def open_bugs(team_key=None):
        return sum(
            1
            for p in parsed
            if p["type"] == "Bug"
            and not p["done"]
            and (team_key is None or p["team"] == team_key)
        )

    def spillover_count(open_issues, sprint):
        if not sprint["active"]:
            return len(open_issues)
        return sum(
            1
            for p in open_issues
            if p["priority"] in ("Highest", "High") or p["status"] == "To Do"
        )

    def spillover_reason(p, sprint):
        if not sprint["active"]:
            return "carryover"
        high = p["priority"] in ("Highest", "High")
        todo = p["status"] == "To Do"
        if high and todo:
            return "high_priority_not_started"
        if high:
            return "high_priority"
        return "not_started"

    def is_spillover_candidate(p, sprint):
        if p["done"]:
            return False
        if not sprint["active"]:
            return True
        return p["priority"] in ("Highest", "High") or p["status"] == "To Do"

    PRIORITY_RANK = {
        "Highest": 0,
        "High": 1,
        "Medium": 2,
        "Low": 3,
        "Lowest": 4,
    }

    def build_schedule_risk(sprint_id, team_key=None):
        """Issue-level evidence behind Overview “items at risk” / spillover count."""
        sprint = SPRINT_BY_ID[sprint_id]
        open_issues = [p for p in filter_committed(sprint_id, team_key) if not p["done"]]
        candidates = [p for p in open_issues if is_spillover_candidate(p, sprint)]
        candidates.sort(
            key=lambda p: (
                PRIORITY_RANK.get(p["priority"], 9),
                0 if p["status"] == "To Do" else 1,
                p["key"] or "",
            )
        )
        definition = (
            "Open sprint work that is Highest/High priority or still To Do — likely to miss the sprint end."
            if sprint["active"]
            else f"Open work that remained unfinished when {sprint['name']} closed."
        )
        items = []
        for p in candidates:
            team_key_resolved = p["team"]
            if not team_key_resolved:
                for tk, hints in TEAM_SPRINT_HINT.items():
                    if p["last_name"] and any(h in p["last_name"].lower() for h in hints):
                        team_key_resolved = tk
                        break
            items.append(
                {
                    "key": p["key"],
                    "summary": p["summary"][:120],
                    "teamKey": team_key_resolved or "UNASSIGNED",
                    "teamName": TEAM_KEY_TO_NAME.get(
                        team_key_resolved or "", team_key_resolved or "Unassigned team"
                    ),
                    "priority": p["priority"] or "—",
                    "status": p["status"] or "—",
                    "reason": spillover_reason(p, sprint),
                }
            )
        by_team: dict[str, int] = {}
        for item in items:
            by_team[item["teamKey"]] = by_team.get(item["teamKey"], 0) + 1
        return {
            "definition": definition,
            "total": len(items),
            "byTeam": [
                {
                    "key": k,
                    "name": TEAM_KEY_TO_NAME.get(k, k),
                    "count": c,
                }
                for k, c in sorted(by_team.items(), key=lambda kv: (-kv[1], kv[0]))
            ],
            "items": items,
        }

    kpi_cache = {}

    def compute_kpis_raw(sprint_id, team_key=None):
        key = (sprint_id, team_key)
        if key in kpi_cache:
            return kpi_cache[key]
        issues = filter_committed(sprint_id, team_key)
        total = len(issues)
        done = sum(1 for p in issues if p["done"])
        open_issues = [p for p in issues if not p["done"]]
        blocked = sum(1 for p in open_issues if p["blocked"])
        sprint = SPRINT_BY_ID[sprint_id]
        spillover = spillover_count(open_issues, sprint)
        completion = round(100 * done / total) if total else 0
        raw = {
            "completion": completion,
            "done": done,
            "total": total,
            "blocked": blocked,
            "spillover": spillover,
            "bugs": open_bugs(team_key),
        }
        kpi_cache[key] = raw
        return raw

    def compute_kpis(sprint_id, team_key=None, prev_sprint_id=None):
        sprint = SPRINT_BY_ID[sprint_id]
        raw = compute_kpis_raw(sprint_id, team_key)
        prev = compute_kpis_raw(prev_sprint_id, team_key) if prev_sprint_id else None
        score = soft_score(raw["completion"], raw["blocked"], raw["spillover"], raw["bugs"])
        band = band_for(score)
        done, total, blocked, spillover, bugs = (
            raw["done"],
            raw["total"],
            raw["blocked"],
            raw["spillover"],
            raw["bugs"],
        )
        completion = raw["completion"]
        ai_map = {"AVENGERS": 8, "APEX": 5, "DARK": 4, "MOBILE": 4, None: 6}
        comp_map = {"AVENGERS": 2, "APEX": 1, "DARK": 1, "MOBILE": 1, None: 4}
        ai, comp = ai_map[team_key], comp_map[team_key]
        team_label = TEAM_KEY_TO_NAME.get(team_key, "TPT Platform")
        name = sprint["name"]

        if sprint["active"]:
            if score < 45:
                caption = (
                    f"{team_label} is at high risk of delay in {name}"
                    if team_key
                    else f"{name} is at risk of delay"
                )
            elif score < 65:
                caption = f"{name} is at risk of delay"
            else:
                caption = f"{name} is tracking to plan"
        else:
            if completion >= 90:
                caption = f"{name} closed near plan"
            elif completion >= 70:
                caption = f"{name} closed with carry-over"
            else:
                caption = f"{name} closed behind plan"

        if prev is None:
            blocked_sub = "From flagged impediments and blockers"
        elif blocked > prev["blocked"]:
            blocked_sub = f"+{blocked - prev['blocked']} from last sprint"
        elif blocked < prev["blocked"]:
            blocked_sub = "Down from last sprint"
        else:
            blocked_sub = "Flat vs last sprint"

        takeaways = [
            {
                "id": "blocked",
                "title": f"{blocked} item{'s' if blocked != 1 else ''} blocked",
                "subtitle": blocked_sub,
                "href": "/delivery-analysis?riskFocus=blockers",
                "tone": "danger" if blocked >= 10 else ("warning" if blocked >= 3 else "success"),
                "glyph": "↗",
                **({"needsAction": True} if blocked >= 3 else {}),
            },
            {
                "id": "at-risk",
                "title": f"{spillover} item{'s' if spillover != 1 else ''} at risk",
                "subtitle": "Likely to spill over" if sprint["active"] else f"Carried past {name}",
                "href": "/delivery-analysis?riskFocus=schedule#schedule-risk",
                "tone": "warning" if spillover >= 5 else ("info" if spillover >= 1 else "success"),
                "glyph": "◷",
                **({"needsAction": True} if spillover >= 5 else {}),
            },
            {
                "id": "ai",
                "title": f"AI code risk at {ai}%",
                "subtitle": "No high-risk areas" if ai < 7 else "Watch hotspots",
                "href": "/code-analysis",
                "tone": "success",
                "glyph": "</>",
            },
            {
                "id": "compliance",
                "title": f"{comp} compliance finding{'s' if comp != 1 else ''}",
                "subtitle": "Mock — not in Jira export",
                "href": "/governance",
                "tone": "warning" if comp >= 3 else "success",
                "glyph": "♢",
                **({"needsAction": True} if comp >= 3 else {}),
            },
        ]

        delivery_score = completion
        code_score = clamp(85 - blocked * 2.5)
        qa_score = clamp(90 - min(50, bugs / 4) - (15 if bugs > 100 else 0))
        compliance_score = clamp(95 - comp * 7)
        prev_code = clamp(85 - prev["blocked"] * 2.5) if prev else None
        prev_qa = (
            clamp(90 - min(50, prev["bugs"] / 4) - (15 if prev["bugs"] > 100 else 0))
            if prev
            else None
        )

        pillars = [
            {
                "id": "delivery",
                "name": "Delivery",
                "score": delivery_score,
                "delta": (delivery_score - prev["completion"]) if prev else 0,
                "footnote": f"{done} / {total} completed",
                "progress": delivery_score,
                "tone": tone_for(delivery_score),
                "glyph": "⚑",
                "href": "/delivery-analysis",
            },
            {
                "id": "code",
                "name": "Code",
                "score": code_score,
                "delta": (code_score - prev_code) if prev_code is not None else 0,
                "footnote": f"{blocked} blocked issue{'s' if blocked != 1 else ''}",
                "progress": code_score,
                "tone": tone_for(code_score),
                "glyph": "</>",
                "href": "/code-analysis",
            },
            {
                "id": "qa",
                "name": "QA",
                "score": qa_score,
                "delta": (qa_score - prev_qa) if prev_qa is not None else 0,
                "footnote": f"{bugs} open bugs",
                "progress": qa_score,
                "tone": tone_for(qa_score),
                "glyph": "⚗",
                "href": "/qa",
            },
            {
                "id": "compliance",
                "name": "Compliance",
                "score": compliance_score,
                "delta": 0,
                "footnote": f"{comp} open finding{'s' if comp != 1 else ''}",
                "progress": compliance_score,
                "tone": tone_for(compliance_score),
                "glyph": "♢",
                "href": "/governance",
            },
        ]

        if blocked >= 3:
            attention_message = (
                f"{blocked} blocked issues are in the evidence set — ask engineering for an owner and ETA."
            )
            attention_count = 2
        elif spillover >= 5:
            attention_message = (
                f"{spillover} items look likely to spill — review scope before close."
            )
            attention_count = 2
        else:
            attention_message = (
                f"{name} delivery signals look manageable — keep owners current."
            )
            attention_count = 1 if (blocked or spillover) else 0

        return {
            "score": score,
            "band": band,
            "caption": caption,
            "completion": completion,
            "done": done,
            "total": total,
            "blocked": blocked,
            "spillover": spillover,
            "ai": ai,
            "comp": comp,
            "bugs": bugs,
            "takeaways": takeaways,
            "pillars": pillars,
            "attention_count": attention_count,
            "attention_message": attention_message,
        }

    def build_burndown(sprint_id, team_key=None):
        sprint = SPRINT_BY_ID[sprint_id]
        issues = filter_committed(sprint_id, team_key)
        total = len(issues)
        days = list(daterange(sprint["start"], sprint["end"]))
        sample = (
            days
            if len(days) <= 8
            else [days[round(i * (len(days) - 1) / 7)] for i in range(8)]
        )
        ideal, actual = [], []
        for i, d in enumerate(sample):
            t = i / (len(sample) - 1) if len(sample) > 1 else 1
            ideal.append({"label": day_label(d), "value": round(total * (1 - t))})
            remaining = sum(
                1 for p in issues if not (p["resolved"] and p["resolved"].date() <= d)
            )
            actual.append({"label": day_label(d), "value": remaining})
        return {
            "completed": sum(1 for p in issues if p["done"]),
            "total": total,
            "ideal": ideal,
            "actual": actual,
        }

    def build_heatmap(sprint_id, team_key=None):
        sprint = SPRINT_BY_ID[sprint_id]
        days = list(daterange(sprint["start"], sprint["end"]))
        if len(days) > 14:
            days = days[-14:]
        day_labels = [day_label(d) for d in days]
        jira_counts = []
        for d in days:
            c = 0
            for p in parsed:
                if team_key and p["team"] != team_key:
                    continue
                if (p["updated"] and p["updated"].date() == d) or (
                    p["created"] and p["created"].date() == d
                ):
                    c += 1
            jira_counts.append(c)
        m = max(jira_counts) or 1
        jira_cells = [
            0 if c == 0 else max(1, min(4, round(4 * c / m))) for c in jira_counts
        ]
        commits, prs, deploys = [], [], []
        for i, c in enumerate(jira_counts):
            commits.append(min(4, (c // 3 + (i % 3)) if c else (0 if i % 4 else 1)))
            prs.append(min(4, (c // 4 + ((i + 1) % 3)) if c else (0 if i % 5 else 1)))
            deploys.append(0 if i % 3 else (1 if c < 5 else (2 if c < 15 else 3)))
        return {
            "rangeLabel": "Last 2 weeks",
            "dayLabels": day_labels,
            "rows": [
                {"label": "Commits", "cells": commits},
                {"label": "PRs", "cells": prs},
                {"label": "Jira updates", "cells": jira_cells},
                {"label": "Deployments", "cells": deploys},
            ],
        }

    def build_delivery_extras(sprint_id, team_key=None):
        """Schedule/hygiene/version evidence for the Delivery analysis page."""
        issues = filter_committed(sprint_id, team_key)
        week_start = AS_OF_DATE - timedelta(days=7)
        stale_cutoff = AS_OF - timedelta(days=30)
        todo = in_progress = done = overdue = 0
        missing_due_in_progress = stale_open = missing_estimates = unassigned = 0
        resolved_last_7d = 0
        versions = {}
        for p in issues:
            cat = p["status_category"]
            if p["resolved"] and p["resolved"].date() >= week_start:
                resolved_last_7d += 1
            for name in p["fix_versions"]:
                bucket = versions.setdefault(name, {"open": 0, "done": 0})
                bucket["done" if p["done"] else "open"] += 1
            if p["done"] or cat == "Done":
                done += 1
                continue
            if cat == "To Do":
                todo += 1
            else:
                in_progress += 1
            if p["due"] and p["due"].date() < AS_OF_DATE:
                overdue += 1
            if cat == "In Progress" and not p["due"]:
                missing_due_in_progress += 1
            if p["created"] and p["created"] < stale_cutoff:
                stale_open += 1
            if not p["story_points"]:
                missing_estimates += 1
            if not p["assignee"]:
                unassigned += 1

        version_rows = []
        for name, counts in versions.items():
            target = parse_version_date(name)
            open_n = counts["open"]
            released = open_n == 0
            overdue_version = bool(open_n > 0 and target and target < AS_OF_DATE)
            version_rows.append(
                {
                    "id": version_id(name),
                    "name": name,
                    "released": released,
                    "releaseDate": target.isoformat() if target else None,
                    "overdue": overdue_version,
                    "openIssuesInVersion": open_n,
                }
            )
        version_rows.sort(
            key=lambda v: (-v["openIssuesInVersion"], v["name"])
        )

        return {
            "overdue": overdue,
            "resolvedLast7d": resolved_last_7d,
            "statusBreakdown": {
                "todo": todo,
                "inProgress": in_progress,
                "done": done,
            },
            "openIssues": todo + in_progress,
            "missingDueDateInProgress": missing_due_in_progress,
            "staleOpen": stale_open,
            "missingEstimates": missing_estimates,
            "unassigned": unassigned,
            "versions": version_rows,
        }

    def build_trend(sprint_id, team_key=None):
        """Weekly throughput-vs-created ratio as a confidence proxy (0–100)."""
        end = SPRINT_BY_ID[sprint_id]["end"]
        start = end - timedelta(days=42)
        points = []
        for i in range(10):
            d = start + timedelta(days=round(i * 42 / 9))
            w0 = d - timedelta(days=6)
            resolved_n = created_n = blocked_open = 0
            for p in parsed:
                if team_key and p["team"] != team_key:
                    continue
                if not p["in_scope"]:
                    continue
                if p["resolved"] and w0 <= p["resolved"].date() <= d:
                    resolved_n += 1
                if p["created"] and w0 <= p["created"].date() <= d:
                    created_n += 1
                if (
                    p["created"]
                    and p["created"].date() <= d
                    and (not p["resolved"] or p["resolved"].date() > d)
                    and p["blocked"]
                ):
                    blocked_open += 1
            # Net flow: resolve more than create → higher score
            denom = max(created_n, 1)
            flow = resolved_n / denom
            val = 40 + min(45, flow * 35) - min(12, blocked_open * 0.8)
            # Blend toward known sprint completion late in series
            points.append({"label": day_label(d), "value": clamp(val)})
        # Anchor last point toward active/closed sprint completion so the
        # chart ends near the KPI the user sees on the confidence card.
        raw = compute_kpis_raw(sprint_id, team_key)
        if points:
            points[-1]["value"] = clamp(0.55 * points[-1]["value"] + 0.45 * raw["completion"])
        return {"rangeLabel": "Last 6 weeks", "target": 75, "points": points}

    org27 = compute_kpis("27", None, "26")
    payload = {
        "lastSyncAt": AS_OF.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "orgName": "TPT Platform",
        "projectKey": "TP",
        "defaultSprintId": "27",
        "teams": [{"key": k, "name": v} for k, v in TEAM_KEY_TO_NAME.items()],
        "sprints": [
            {
                "id": s["id"],
                "name": s["name"],
                "startLabel": day_label(s["start"]),
                "endLabel": day_label(s["end"]),
                "rangeLabel": f"{day_label(s['start'])} – {day_label(s['end'])}, 2026",
                "start": s["start"].isoformat(),
                "end": s["end"].isoformat(),
            }
            for s in SPRINTS
        ],
        "base": {
            **org27,
            "charts": {
                "deliveryTrend": build_trend("27"),
                "burndown": build_burndown("27"),
                "heatmap": build_heatmap("27"),
            },
        },
        "byTeam": {tk: compute_kpis("27", tk, "26") for tk in TEAM_KEY_TO_NAME},
        "bySprint": {
            sid: {
                "kpis": compute_kpis(sid, None, PREV_MAP[sid]),
                "charts": {
                    "deliveryTrend": build_trend(sid),
                    "burndown": build_burndown(sid),
                    "heatmap": build_heatmap(sid),
                },
            }
            for sid in ["24", "25", "26"]
        },
        "byTeamSprint": {
            f"{tk}:{sid}": compute_kpis(sid, tk, PREV_MAP[sid])
            for sid in ["24", "25", "26"]
            for tk in TEAM_KEY_TO_NAME
        },
        "scheduleRiskBySprint": {
            sid: build_schedule_risk(sid) for sid in [s["id"] for s in SPRINTS]
        },
        "scheduleRiskByTeamSprint": {
            f"{tk}:{sid}": build_schedule_risk(sid, tk)
            for sid in [s["id"] for s in SPRINTS]
            for tk in TEAM_KEY_TO_NAME
        },
        "jiraSiteUrl": "https://takeprofittrader.atlassian.net",
        "deliveryBySprint": {
            sid: build_delivery_extras(sid) for sid in [s["id"] for s in SPRINTS]
        },
        "deliveryByTeamSprint": {
            f"{tk}:{sid}": build_delivery_extras(sid, tk)
            for sid in [s["id"] for s in SPRINTS]
            for tk in TEAM_KEY_TO_NAME
        },
        "notes": {
            "jiraSource": str(csv_path),
            "scope": "Latest sprint; Story/Bug/Feature/Epic only (Sub-tasks excluded)",
            "mockKept": [
                "aiRisk",
                "compliance",
                "commits",
                "prs",
                "deployments",
                "leadership",
            ],
            "derived": [
                "completion",
                "blocked",
                "spillover",
                "scheduleRiskEvidence",
                "burndown",
                "jiraHeatmap",
                "trend",
                "qaOpenBugs",
                "confidenceScore",
                "deliveryVersions",
                "deliveryHygiene",
                "overdue",
            ],
        },
    }

    OUT_TS.write_text(
        f"""/**
 * Overview mock derived from TPT Jira export (`{csv_path}`).
 * Regenerated by `scripts/generate-tpt-overview-mock.py`.
 *
 * Jira-backed: teams/sprints, completion, blocked, spillover, burndown,
 * delivery-trend proxy, Jira heatmap row, open bugs, confidence score,
 * overdue, fix versions, and Jira hygiene counts.
 * Still mocked: AI code risk, compliance, commits/PRs/deployments rows,
 * leadership approvals.
 */
export const TPT_OVERVIEW_DERIVED = {json.dumps(payload, indent=2)} as const;

export type TptOverviewDerived = typeof TPT_OVERVIEW_DERIVED;
"""
    )
    print(f"Wrote {OUT_TS}")
    print(
        f"base score={org27['score']} {org27['band']} "
        f"{org27['done']}/{org27['total']} blocked={org27['blocked']} spill={org27['spillover']}"
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Connexus Sprint 34 — Jira ticket ↔ commit mapping.

Builds three artifacts in `tmp/`:
  - connexus-sprint34-tickets-enriched.json       (full Jira field data per ticket)
  - connexus-sprint34-commits-enriched.jsonl      (commit metadata, one JSON per line)
  - connexus-sprint34-ticket-commit-map.csv       (one row per ticket-commit pair; one row per ticket with no match)
  - connexus-sprint34-ticket-commit-map-summary.json

Reads:
  tmp/connexus-sprint34-done.csv                       — ticket keys (column "key")
  tmp/connexus-sprint34-repo-fetch-manifest.json       — repo + commitsFile paths

Auth env vars required at runtime (see scripts/_get-jira-env-sprint34.ts):
  JIRA_TOKEN, JIRA_CLOUD_ID, JIRA_SITE_URL
"""

import csv
import json
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp"

DONE_CSV = TMP / "connexus-sprint34-done.csv"
MANIFEST = TMP / "connexus-sprint34-repo-fetch-manifest.json"
TICKETS_OUT = TMP / "connexus-sprint34-tickets-enriched.json"
COMMITS_OUT = TMP / "connexus-sprint34-commits-enriched.jsonl"
CSV_OUT = TMP / "connexus-sprint34-ticket-commit-map.csv"
SUMMARY_OUT = TMP / "connexus-sprint34-ticket-commit-map-summary.json"

JQL_BATCH = 40
COMMIT_BATCH = 200
GIT_SHOW_FMT = "%H%x1F%an%x1F%ae%x1F%ad%x1F%s"  # fields separated by US (0x1F)
JIRA_KEY_RE = re.compile(r"\bCX[-_]?(\d+)\b", re.IGNORECASE)

# Three-segment JWT-shaped strings (header.payload.signature).
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
BEARER_RE = re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]+")


def redact_secrets(text):
    """Replace JWT-shaped strings and bearer tokens with redactions."""
    if not text:
        return text
    text = BEARER_RE.sub(r"\1<redacted-token>", text)
    text = JWT_RE.sub("<redacted-jwt>", text)
    return text


# ---------------------------------------------------------------------------
# Jira fetch (curl-style POST so we can set custom headers cleanly)
# ---------------------------------------------------------------------------

def fetch_jira_batch(keys, fields):
    """Fetch one batch of Jira issues via /rest/api/3/search/jql. Returns dict issues[].fields."""
    if not keys:
        return []
    cloud_id = os.environ.get("JIRA_CLOUD_ID", "").strip()
    token = os.environ.get("JIRA_TOKEN", "").strip()
    if not cloud_id or not token:
        raise RuntimeError("JIRA_CLOUD_ID / JIRA_TOKEN env vars missing")

    url = f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/search/jql"
    quoted = ",".join(f'"{k}"' for k in keys)
    jql = f"key in ({quoted})"
    body = json.dumps({
        "jql": jql,
        "maxResults": len(keys),
        "fields": fields,
    }).encode("utf-8")

    last_err = None
    for attempt in range(4):
        req = urllib_request.Request(
            url,
            data=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("issues", [])
        except urllib_error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="ignore")[:400]
            last_err = f"HTTP {e.code}: {detail}"
            # Rate limit or 5xx: back off and retry
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"Jira fetch failed: {last_err}") from e
        except urllib_error.URLError as e:
            last_err = f"URLError: {e}"
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Jira fetch exhausted retries: {last_err}")


# ---------------------------------------------------------------------------
# ADF → plain text
# ---------------------------------------------------------------------------

def adf_to_text(node):
    """Recursively strip an Atlassian Document Format tree to readable text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(adf_to_text(n) for n in node)
    if not isinstance(node, dict):
        return ""
    t = node.get("type")
    if t == "text":
        return node.get("text", "") or ""
    if t == "hardBreak":
        return "\n"

    inner = "".join(adf_to_text(c) for c in node.get("content", []) or [])
    if t in ("paragraph", "heading"):
        return inner + "\n"
    if t in ("listItem",):
        return inner + "\n"
    if t in ("bulletList", "orderedList", "blockquote"):
        return inner
    return inner


# ---------------------------------------------------------------------------
# Step A: enrich Jira tickets
# ---------------------------------------------------------------------------

def enrich_jira_tickets(keys):
    fields = [
        "summary",
        "description",
        "assignee",
        "reporter",
        "status",
        "issuetype",
        "priority",
        "labels",
        "created",
        "updated",
        "resolutiondate",
        "customfield_10016",
    ]

    batches = [keys[i:i + JQL_BATCH] for i in range(0, len(keys), JQL_BATCH)]
    print(f"[jira] {len(keys)} tickets in {len(batches)} batches of up to {JQL_BATCH}", file=sys.stderr)

    out = {}
    for i, batch in enumerate(batches, 1):
        issues = fetch_jira_batch(batch, fields)
        found_keys = set()
        for issue in issues:
            key = issue.get("key")
            if not key:
                continue
            found_keys.add(key.upper())
            f = issue.get("fields", {}) or {}
            description = f.get("description")
            desc_text = adf_to_text(description).strip() if description else ""
            desc_text = redact_secrets(desc_text)
            assignee = f.get("assignee") or {}
            reporter = f.get("reporter") or {}
            status = f.get("status") or {}
            issuetype = f.get("issuetype") or {}
            priority = f.get("priority") or {}
            story_points = f.get("customfield_10016")
            try:
                story_points_val = float(story_points) if story_points not in (None, "") else None
            except (TypeError, ValueError):
                story_points_val = None

            record = {
                "key": key,
                "summary": f.get("summary", "") or "",
                "description": desc_text,
                "assignee": assignee.get("displayName") or "",
                "assigneeAccountId": assignee.get("accountId") or "",
                "reporter": reporter.get("displayName") or "",
                "status": status.get("name") or "",
                "issueType": issuetype.get("name") or "",
                "priority": priority.get("name") or "",
                "labels": f.get("labels") or [],
                "storyPoints": story_points_val,
                "created": f.get("created") or "",
                "updated": f.get("updated") or "",
                "resolutionDate": f.get("resolutiondate") or "",
                "browseUrl": f"{os.environ.get('JIRA_SITE_URL', '').rstrip('/')}/browse/{key}",
            }
            out[key.upper()] = record

        # Note missing keys
        missing = [k for k in batch if k.upper() not in found_keys]
        if missing:
            print(f"[jira] batch {i}: missing keys = {missing}", file=sys.stderr)

    # Provide placeholder records for any keys that Jira didn't return
    placeholders = 0
    for k in keys:
        if k.upper() not in out:
            placeholders += 1
            out[k.upper()] = {
                "key": k.upper(),
                "summary": "[NOT FOUND IN JIRA]",
                "description": "",
                "assignee": "",
                "assigneeAccountId": "",
                "reporter": "",
                "status": "",
                "issueType": "",
                "priority": "",
                "labels": [],
                "storyPoints": None,
                "created": "",
                "updated": "",
                "resolutionDate": "",
                "browseUrl": f"{os.environ.get('JIRA_SITE_URL', '').rstrip('/')}/browse/{k}",
                "_missing": True,
            }
    print(f"[jira] enriched {len(out)} tickets ({placeholders} placeholders)", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# Step B: enrich commits
# ---------------------------------------------------------------------------

def git_show(repo_path, sha):
    """Return parsed dict from `git show -s --format=<fmt> --date=iso-strict <sha>` or None."""
    try:
        res = subprocess.run(
            ["git", "-C", repo_path, "show", "-s", "--no-notes",
             f"--format={GIT_SHOW_FMT}", "--date=iso-strict", sha],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except subprocess.TimeoutExpired:
        return None
    if res.returncode != 0:
        return None
    line = res.stdout.strip()
    if not line:
        return None
    parts = line.split("\x1f")
    if len(parts) < 5:
        return None
    sha_out, author_name, author_email, date, subject = parts[0], parts[1], parts[2], parts[3], parts[4]
    return {
        "sha": sha_out,
        "authorName": author_name,
        "authorEmail": author_email,
        "commitDate": date,
        "subject": subject,
    }


def git_body(repo_path, sha):
    """Return raw commit body (`git log -1 --format=%b <sha>`), or ''."""
    try:
        res = subprocess.run(
            ["git", "-C", repo_path, "log", "-1", "--no-notes", "--format=%b", sha],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except subprocess.TimeoutExpired:
        return ""
    if res.returncode != 0:
        return ""
    return res.stdout


def enrich_commits(manifest):
    repos = manifest.get("repos", [])
    processed = 0
    with COMMITS_OUT.open("w", encoding="utf-8") as f:
        for repo in repos:
            name = repo["name"]
            git_path = repo["gitPath"]
            commits_file = repo["commitsFile"]
            expected = repo.get("commitCount", 0)
            if expected <= 0:
                continue
            if not Path(git_path).exists():
                print(f"[git] repo {name}: gitPath {git_path} not present, skipping", file=sys.stderr)
                continue
            shas = [ln.strip() for ln in Path(commits_file).read_text().splitlines() if ln.strip()]
            print(f"[git] {name}: {len(shas)} shas", file=sys.stderr)

            for i in range(0, len(shas), COMMIT_BATCH):
                chunk = shas[i:i + COMMIT_BATCH]
                for sha in chunk:
                    meta = git_show(git_path, sha)
                    if not meta:
                        continue
                    body = git_body(git_path, sha)
                    rec = {
                        "sha": meta["sha"],
                        "repo": repo["repo"],
                        "repoName": name,
                        "primaryBranch": repo.get("primaryBranch", "dev"),
                        "branch": repo.get("primaryBranch", "dev"),
                        "authorName": meta["authorName"],
                        "authorEmail": meta["authorEmail"],
                        "commitDate": meta["commitDate"],
                        "subject": meta["subject"],
                        "body": body,
                    }
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    processed += 1
            print(f"[git] {name} done, total processed so far: {processed}", file=sys.stderr)
    print(f"[git] total commits written: {processed}", file=sys.stderr)
    return processed


# ---------------------------------------------------------------------------
# Step C: match tickets ↔ commits
# ---------------------------------------------------------------------------

MERGE_BRANCH_RE = re.compile(
    r"\b(?:from|origin|head|into)\s+[\w./-]*?(CX[-_]?\d+)[-_][\w.-]*",
    re.IGNORECASE,
)


def extract_keys(text):
    if not text:
        return set()
    s = set()
    for m in JIRA_KEY_RE.finditer(text):
        s.add(f"CX-{m.group(1)}")
    return s


def extract_branch_keys(text):
    """Look for merge-commit branch refs that contain a CX key (low-confidence signal)."""
    if not text:
        return set()
    s = set()
    for m in MERGE_BRANCH_RE.finditer(text):
        s.add(f"CX-{m.group(1)}")
    return s


def build_inverted_index(tickets, commits):
    """Returns:
       key -> list of (commit dict, matchMethod)
       Also pre-computes matchedJiraKeysInCommit per commit.
    """
    subject_keys_per_commit = []
    body_keys_per_commit = []
    branch_keys_per_commit = []

    for c in commits:
        subj_keys = extract_keys(c.get("subject", ""))
        body_all = set()
        body_all |= extract_keys(c.get("body", ""))
        body_only = body_all - subj_keys
        branch_only = extract_branch_keys((c.get("subject") or "") + "\n" + (c.get("body") or "")) - subj_keys - body_all
        subject_keys_per_commit.append(subj_keys)
        body_keys_per_commit.append(body_only)
        branch_keys_per_commit.append(branch_only)
        c["_matchedJiraKeys"] = sorted(subj_keys | body_only | branch_only)
        c["_subjectKeys"] = subj_keys
        c["_bodyKeys"] = body_only
        c["_branchKeys"] = branch_only

    inv = defaultdict(list)
    seen = defaultdict(set)
    for c in commits:
        keys = c["_matchedJiraKeys"]
        for k in keys:
            # Decide which method "wins" for that commit's link to this ticket
            if k in c["_subjectKeys"]:
                inv[k].append((c, "key_in_subject"))
            elif k in c["_bodyKeys"]:
                inv[k].append((c, "key_in_body"))
            else:
                inv[k].append((c, "branch_name"))
            seen[k].add(c["sha"])
    return inv


# ---------------------------------------------------------------------------
# Step D: CSV + summary
# ---------------------------------------------------------------------------

CSV_COLUMNS = [
    "ticketKey",
    "ticketSummary",
    "ticketDescription",
    "ticketAssignee",
    "ticketReporter",
    "ticketStatus",
    "ticketIssueType",
    "ticketPriority",
    "ticketLabels",
    "ticketStoryPoints",
    "ticketCreated",
    "ticketUpdated",
    "ticketResolutionDate",
    "ticketBrowseUrl",
    "commitSha",
    "commitRepo",
    "commitBranch",
    "commitDate",
    "commitAuthorName",
    "commitAuthorEmail",
    "commitSubject",
    "commitBodyExcerpt",
    "matchMethod",
    "matchConfidence",
    "matchedJiraKeysInCommit",
]

DESC_MAX = 2000
BODY_MAX = 500


def csv_escape(value):
    if value is None:
        return ""
    s = str(value)
    if any(c in s for c in (",", '"', "\n", "\r")):
        return '"' + s.replace('"', '""') + '"'
    return s


def write_csv(tickets, inv_index, out_path):
    """One row per (ticket, matched commit); one row per unmatched ticket."""
    tickets_upper = {k.upper(): v for k, v in tickets.items()}
    keys_sorted = sorted(tickets_upper.keys())

    rows_written = 0
    rows_high = 0
    rows_medium = 0
    rows_low = 0
    rows_none = 0

    confidence_to_method = {
        "high": "key_in_subject",
        "medium": "key_in_body",
        "low": "branch_name",
    }

    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(CSV_COLUMNS)

        for key in keys_sorted:
            ticket = tickets_upper[key]
            tdesc_full = ticket.get("description", "") or ""
            tdesc = tdesc_full[:DESC_MAX]
            tcsv = [
                ticket.get("key", key),
                ticket.get("summary", ""),
                tdesc,
                ticket.get("assignee", ""),
                ticket.get("reporter", ""),
                ticket.get("status", ""),
                ticket.get("issueType", ""),
                ticket.get("priority", ""),
                ";".join(ticket.get("labels", []) or []),
                "" if ticket.get("storyPoints") is None else ticket.get("storyPoints"),
                ticket.get("created", ""),
                ticket.get("updated", ""),
                ticket.get("resolutionDate", ""),
                ticket.get("browseUrl", ""),
            ]

            matches = inv_index.get(key, [])
            if not matches:
                writer.writerow(tcsv + ["", "", "", "", "", "", "", "", "", "none", ""])
                rows_written += 1
                rows_none += 1
                continue

            for commit, method in matches:
                body_excerpt = (commit.get("body", "") or "")[:BODY_MAX]
                body_excerpt = redact_secrets(body_excerpt)
                if method == "key_in_subject":
                    confidence = "high"
                elif method == "key_in_body":
                    confidence = "medium"
                else:
                    confidence = "low"
                csv_row = tcsv + [
                    commit.get("sha", ""),
                    commit.get("repo", ""),
                    commit.get("branch", "dev"),
                    commit.get("commitDate", ""),
                    commit.get("authorName", ""),
                    commit.get("authorEmail", ""),
                    commit.get("subject", ""),
                    body_excerpt,
                    method,
                    confidence,
                    ";".join(commit.get("_matchedJiraKeys", []) or []),
                ]
                writer.writerow(csv_row)
                rows_written += 1
                if confidence == "high":
                    rows_high += 1
                elif confidence == "medium":
                    rows_medium += 1
                else:
                    rows_low += 1

    print(f"[csv] {rows_written} rows written", file=sys.stderr)
    return {
        "totalRows": rows_written,
        "confidenceBreakdown": {
            "high": rows_high, "medium": rows_medium, "low": rows_low, "none": rows_none,
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # --- Load inputs
    if not DONE_CSV.exists():
        sys.exit(f"missing {DONE_CSV}")
    if not MANIFEST.exists():
        sys.exit(f"missing {MANIFEST}")

    with DONE_CSV.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
    keys = [r["key"].strip() for r in rows if r.get("key")]
    print(f"[init] ticket keys from CSV: {len(keys)}", file=sys.stderr)

    manifest = json.loads(MANIFEST.read_text())

    # --- Step A: enrich Jira tickets
    tickets = enrich_jira_tickets(keys)
    TICKETS_OUT.write_text(json.dumps(tickets, indent=2, ensure_ascii=False))
    print(f"[jira] wrote {TICKETS_OUT}", file=sys.stderr)

    # --- Step B: enrich commits
    if not COMMITS_OUT.exists():
        n_commits = enrich_commits(manifest)
        print(f"[commits] wrote {COMMITS_OUT}", file=sys.stderr)
    else:
        print(f"[commits] {COMMITS_OUT} exists, reusing", file=sys.stderr)

    commits = []
    with COMMITS_OUT.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                commits.append(json.loads(line))
    print(f"[commits] loaded {len(commits)} records", file=sys.stderr)

    # --- Step C: match
    inv = build_inverted_index(tickets, commits)

    # --- Step D: CSV
    csv_stats = write_csv(tickets, inv, CSV_OUT)

    # --- Summary JSON
    matches_per_ticket = {k: len(v) for k, v in inv.items()}
    matched_keys = set(matches_per_ticket.keys())
    ticket_keys = {k.upper() for k in keys}
    tickets_with_at_least_one_commit = sum(1 for k in ticket_keys if matches_per_ticket.get(k, 0) > 0)
    tickets_with_no_commit = len(ticket_keys) - tickets_with_at_least_one_commit

    total_commit_rows = csv_stats["totalRows"] - csv_stats["confidenceBreakdown"]["none"]
    unique_commits = set()
    for k in ticket_keys:
        for c, _ in inv.get(k, []):
            unique_commits.add(c["sha"])
    # Commits in window that didn't link to any Sprint 34 done-list ticket.
    # (Matches to OTHER CX-#### keys still count as unmatched against this sprint.)
    total_commits = len(commits)
    commits_in_window_unmatched = total_commits - len(unique_commits)

    top = sorted(
        ((k, len(v)) for k, v in inv.items() if k in ticket_keys),
        key=lambda kv: (-kv[1], kv[0]),
    )[:10]
    top_list = [{"key": k, "commitCount": n} for k, n in top]

    summary = {
        "ticketCount": len(ticket_keys),
        "ticketsWithAtLeastOneCommit": tickets_with_at_least_one_commit,
        "ticketsWithNoCommit": tickets_with_no_commit,
        "totalCommitRows": total_commit_rows,
        "uniqueCommitsMatched": len(unique_commits),
        "commitsInWindowUnmatched": commits_in_window_unmatched,
        "matchConfidenceBreakdown": csv_stats["confidenceBreakdown"],
        "topTicketsByCommitCount": top_list,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    SUMMARY_OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"[summary] wrote {SUMMARY_OUT}", file=sys.stderr)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

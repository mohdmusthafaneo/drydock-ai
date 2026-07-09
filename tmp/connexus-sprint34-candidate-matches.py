#!/usr/bin/env python3
"""Connexus Sprint 34 — multi-signal candidate matching for unmatched tickets.

Refined version with:
  - continuous date-signal falloff (no hard cutoff at 30d outside the window)
  - per-ticket "bestGuess" flag marking the top candidate
  - richer evidenceSignals breakdown
  - evidence tier labels that describe WHICH signals matched
"""

import csv
import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp"

TICKETS_F = TMP / "connexus-sprint34-tickets-enriched.json"
COMMITS_F = TMP / "connexus-sprint34-commits-enriched.jsonl"
MAIN_CSV  = TMP / "connexus-sprint34-ticket-commit-map.csv"
OUT_CSV   = TMP / "connexus-sprint34-candidate-matches.csv"
OUT_SUMMARY = TMP / "connexus-sprint34-candidate-summary.json"

STOPWORDS = {
    "the","a","an","and","or","not","of","in","on","at","to","for","with","by","is",
    "be","are","was","were","as","it","this","that","from","but","if","so","do","does",
    "did","have","has","had","can","could","should","will","would","may","might","must",
    "no","yes","up","down","out","over","into","than","then","because","use","using",
    "via","after","before","still","only","also","more","most","such","very","just",
    "any","all","each","few","many","one","two","three","four","five","six","seven",
    "make","made","need","needs","needed","add","adds","added","update","updates",
    "updated","change","changes","changed","fix","fixes","fixed","feat","feature","chore",
    "refactor","refactored","remove","removed","wip","todo","test","tests",
    "type","types","user","users","page","pages","step","steps","issue","issues",
    "ticket","tickets","field","fields","value","values","click","clicks","button",
    "buttons","error","errors","working","works","work","task","tasks","story","stories",
    "module","modules","view","views","option","options","select","selection","case",
    "cases","property","properties","insurance","upload","download",
    "loading","loaded","load","loads","delete","deleted","display","displayed",
    "showing","showed","show","shows","open","opens","opening","closed","closes",
    "closing","close","first","last","next","prev","previous","current","new","old",
    "part","parts","section","sections",
    "email","emails","mail","send","sent","receive","received","recipient","list",
    "listing","content","contents","data","row","rows","col","cols","column","columns",
}

WORD_RE = re.compile(r"[a-z0-9_]+")


def load_tickets():
    return json.loads(TICKETS_F.read_text())


def load_commits():
    out = []
    with COMMITS_F.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                out.append(json.loads(line))
    return out


def matched_keys():
    s = set()
    with MAIN_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["commitSha"]:
                s.add(row["ticketKey"])
    return s


def norm_name(s):
    if not s:
        return ""
    s = s.lower().strip()
    s = re.sub(r"\d+", "", s)
    s = re.sub(r"[^a-z\s.\-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def first_name_parts(name):
    parts = norm_name(name).split()
    if not parts:
        return ("", "")
    return (parts[0], parts[-1])


def commit_author_name_key(author):
    n = norm_name(author.get("authorName", ""))
    if n:
        return n
    email = (author.get("authorEmail") or "").split("@", 1)[0]
    return norm_name(email)


def ticket_assignee_keys(ticket):
    name = ticket.get("assignee") or ""
    if not name:
        return set()
    norm = norm_name(name)
    first, last = first_name_parts(name)
    out = {norm}
    if first:
        out.add(first)
    if last and last != first:
        out.add(last)
    return out


def parse_date(s):
    """Parse ISO-ish date. Handles Jira format (`+0530` no colon) and `Z`.

    Python 3.9's `datetime.fromisoformat` rejects `+0530`. Python 3.11+ accepts it.
    This helper normalises both to a colon so it works on 3.9.
    """
    if not s:
        return None
    s = s.strip()
    # Insert colon in timezone offsets like +0530 -> +05:30
    s = re.sub(r"([+-])(\d{2})(\d{2})$", r"\1\2:\3", s)
    s = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def tokens(text, min_len=3):
    if not text:
        return set()
    out = set()
    for m in WORD_RE.finditer(text.lower()):
        w = m.group()
        if len(w) >= min_len and w not in STOPWORDS:
            out.add(w)
    return out


def jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = a & b
    union = a | b
    return len(inter) / len(union) if union else 0.0


def date_signal(commit_date, ticket):
    """Continuous falloff. Returns (score, gap_days_in_or_out_of_window).

    In window:  1.0
    ±7 days:    0.85
    ±14 days:   0.65
    ±30 days:   0.45
    ±60 days:   0.25
    ±90 days:   0.10
    ±120 days:  0.03
    beyond:     0.0
    """
    cd = parse_date(commit_date)
    cr = parse_date(ticket.get("created"))
    rd = parse_date(ticket.get("resolutionDate"))
    if not cd or not cr:
        return 0.0, None
    # Strip timezones to compare apples-to-apples
    cd_naive = cd.replace(tzinfo=None) if cd.tzinfo else cd
    cr_naive = cr.replace(tzinfo=None) if cr.tzinfo else cr
    rd_naive = rd.replace(tzinfo=None) if rd and rd.tzinfo else rd
    start = cr_naive - timedelta(days=14)
    end = (rd_naive + timedelta(days=60)) if rd_naive else (cr_naive + timedelta(days=120))
    if cd_naive < start:
        gap_d = (start - cd_naive).days  # positive days before window
    elif cd_naive > end:
        gap_d = (cd_naive - end).days    # positive days after window
    else:
        gap_d = 0
    if gap_d == 0:
        return 1.0, gap_d
    if gap_d <= 7:    return 0.85, gap_d
    if gap_d <= 14:   return 0.65, gap_d
    if gap_d <= 30:   return 0.45, gap_d
    if gap_d <= 60:   return 0.25, gap_d
    if gap_d <= 90:   return 0.10, gap_d
    if gap_d <= 120:  return 0.03, gap_d
    return 0.0, gap_d


def name_match_score(author_name, email, assignee_name):
    """Score how likely the commit author is the same person as the Jira assignee.

    Robust to:
      - Git-Jira format drift ("Rakhesh J" vs "rakhesh.j")
      - GitHub username vs full name ("varunw92" vs "Varun Wilson")
      - Initial-compressed names ("Ramesh P R" vs "rameshpr")
      - Case and digit differences
    """
    a = norm_name(author_name)
    b = norm_name(assignee_name)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0

    # Tokenize on common separators
    at = [t for t in re.split(r"[\s\-_.]+", a) if t]
    bt = [t for t in re.split(r"[\s\-_.]+", b) if t]
    aset, bset = set(at), set(bt)

    # 1. Direct token intersection (handles "Rakhesh J" ↔ "rakhesh.j")
    common = aset & bset
    if common:
        longest = max(common, key=len)
        if at[0] == bt[0]:
            return 0.85          # first-name and last-name tokens both align
        return 0.65 if len(longest) >= 4 else 0.4

    # 2. Substring / prefix matching across tokens
    best = 0.0
    for ta in at:
        for tb in bt:
            if len(ta) >= 3 and len(tb) >= 3:
                if ta.startswith(tb) or tb.startswith(ta):
                    best = max(best, 0.65)   # e.g. "varun" prefix in "varunw"
                elif ta[:4] == tb[:4] and len(ta) >= 4 and len(tb) >= 4:
                    best = max(best, 0.5)    # weak shared prefix

    # 3. Initial compression (handles "Ramesh P R" ↔ "rameshpr")
    a_init = "".join(t[0] for t in at if t)
    if a_init and len(a_init) >= 2 and (a_init in b or b.startswith(a_init)):
        best = max(best, 0.6)
    b_init = "".join(t[0] for t in bt if t)
    if b_init and len(b_init) >= 2 and (b_init in a or a.startswith(b_init)):
        best = max(best, 0.6)

    # 4. Email-local-part (only as assignee-side match, not author-side self-match)
    if email:
        local = norm_name(email.split("@", 1)[0])
        if local and len(local) >= 3:
            if local == b or local in b or b.startswith(local):
                best = max(best, 0.7)

    return best


def score_pair(ticket, commit):
    akeys = ticket_assignee_keys(ticket)
    if not akeys:
        author_score = 0.0
    else:
        # Try the assignee keys directly first (exact normalized-name match)
        akey = commit_author_name_key(commit)
        if akey and akey in akeys:
            author_score = 1.0
        else:
            # Fallback: token-based name match with email hint
            author_score = name_match_score(
                commit.get("authorName", "") or commit.get("authorEmail", ""),
                commit.get("authorEmail", ""),
                ticket.get("assignee", ""),
            )

    date_score, gap = date_signal(commit.get("commitDate", ""), ticket)

    tk = tokens(ticket.get("summary", ""))
    kw_jaccard = 0.0
    if tk:
        ck = tokens((commit.get("subject") or "") + " " + (commit.get("body") or ""))
        kw_jaccard = jaccard(tk, ck)
    kw_score = min(kw_jaccard * 3.0, 1.0)  # rescale; typical Jaccard 0.1-0.4

    keyref_score = 0.0
    subj = commit.get("subject") or ""
    body = commit.get("body") or ""
    if re.search(r"\bCX[-_]?\d+\b", (subj + "\n" + body), re.IGNORECASE):
        # A CX key reference exists. If it were in our done list, the main pipeline
        # would already have linked it. So this is a different CX ticket; small boost.
        keyref_score = 0.3

    composite = (
        0.40 * author_score
        + 0.35 * date_score
        + 0.20 * kw_score
        + 0.05 * keyref_score
    )

    return {
        "author": round(author_score, 3),
        "date": round(date_score, 3),
        "keyword": round(kw_score, 3),
        "keyword_jaccard": round(kw_jaccard, 3),
        "keyref": round(keyref_score, 3),
        "composite": round(min(composite, 1.0), 3),
        "gap_days": gap,
    }


def passes_threshold(score, candidate_min=0.30, distinct_signals_min=2):
    sigs = [score["author"], score["date"], score["keyword"], score["keyref"]]
    n_active = sum(1 for s in sigs if s > 0)
    return score["composite"] >= candidate_min and n_active >= distinct_signals_min


def evidence_label(score):
    """Return a short label like 'A+D+K' for the active signals."""
    parts = []
    if score["author"] > 0: parts.append("A")
    if score["date"] > 0:    parts.append("D")
    if score["keyword"] > 0: parts.append("K")
    if score["keyref"] > 0:  parts.append("X")
    return "+".join(parts) if parts else ""


CANDIDATE_COLUMNS = [
    "ticketKey",
    "ticketSummary",
    "ticketAssignee",
    "ticketCreated",
    "ticketResolutionDate",
    "ticketLabels",
    "commitSha",
    "commitRepo",
    "commitBranch",
    "commitDate",
    "commitAuthorName",
    "commitAuthorEmail",
    "commitSubject",
    "evidenceSignals",
    "signalAuthor",
    "signalDate",
    "signalKeyword",
    "signalKeyRef",
    "compositeScore",
    "gapDaysFromWindow",
    "isBestGuess",
    "evidenceTier",
]


def evidence_tier(score, label):
    """Tier labels reflecting "how strongly should a human trust this candidate?"

    Tier rules (refined):
      - strong    : confident name + tight date + some keyword signal
                    (without keyword, an author+date match could be coincidental)
      - moderate  : confident name + (decent date OR significant keyword)
      - soft      : any two signals at moderate level but no confident name
      - speculative: anything that passed the composite threshold
    """
    a, d, k = score["author"], score["date"], score["keyword"]

    # Strong: confident name + tight date + at least some keyword relevance
    if a >= 0.85 and d >= 0.85 and k >= 0.3:
        return "strong"
    # Strong alternative: confident name + significant keyword + recent-ish date
    if a >= 0.85 and k >= 0.55 and d >= 0.45:
        return "strong"

    # Moderate: confident name + any meaningful supporting signal
    if a >= 0.85 and (d >= 0.45 or k >= 0.4):
        return "moderate"

    # Moderate: medium-conf name + meaningful keyword + recent date
    if a >= 0.65 and k >= 0.5 and d >= 0.45:
        return "moderate"

    # Soft: weaker combos
    if (a >= 0.7 and k >= 0.3) or (a >= 0.5 and d >= 0.65) or (k >= 0.5 and d >= 0.45):
        return "soft"
    return "speculative"


def main():
    tickets = load_tickets()
    commits = load_commits()
    already_matched = matched_keys()

    unmatched_keys = sorted(k for k in tickets.keys() if k not in already_matched)
    print(f"[init] total tickets={len(tickets)}, unmatched={len(unmatched_keys)}, already matched={len(already_matched)}", file=sys.stderr)
    print(f"[init] commits to scan={len(commits)}", file=sys.stderr)

    candidate_rows = []
    total_scored_pairs = 0
    n_tickets_with_candidates = 0
    tier_counter = {"strong": 0, "moderate": 0, "soft": 0, "speculative": 0}

    # Per-ticket best candidate tracking
    per_ticket_best = {}  # key -> (composite, row_dict)

    for tk in unmatched_keys:
        t = tickets[tk]
        per_commit = []
        for c in commits:
            score = score_pair(t, c)
            total_scored_pairs += 1
            if not passes_threshold(score):
                continue
            per_commit.append((score["composite"], score, c))
        if not per_commit:
            continue
        n_tickets_with_candidates += 1
        # Sort
        per_commit.sort(key=lambda x: (-x[0], x[2].get("commitDate", "")))

        for rank, (composite, score, c) in enumerate(per_commit[:5]):
            tier = evidence_tier(score, evidence_label(score))
            tier_counter[tier] += 1
            label = evidence_label(score)
            csv_row = {
                "ticketKey": tk,
                "ticketSummary": t.get("summary", ""),
                "ticketAssignee": t.get("assignee", ""),
                "ticketCreated": t.get("created", ""),
                "ticketResolutionDate": t.get("resolutionDate", ""),
                "ticketLabels": ";".join(t.get("labels") or []),
                "commitSha": c.get("sha", ""),
                "commitRepo": c.get("repo", ""),
                "commitBranch": c.get("branch", "dev"),
                "commitDate": c.get("commitDate", ""),
                "commitAuthorName": c.get("authorName", ""),
                "commitAuthorEmail": c.get("authorEmail", ""),
                "commitSubject": c.get("subject", ""),
                "evidenceSignals": label,
                "signalAuthor": score["author"],
                "signalDate": score["date"],
                "signalKeyword": score["keyword"],
                "signalKeyRef": score["keyref"],
                "compositeScore": score["composite"],
                "gapDaysFromWindow": score["gap_days"] if score["gap_days"] is not None else "",
                "isBestGuess": "TRUE" if rank == 0 else "",
                "evidenceTier": tier,
            }
            candidate_rows.append(csv_row)
            if rank == 0:
                per_ticket_best[tk] = (composite, csv_row)

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CANDIDATE_COLUMNS)
        w.writeheader()
        for row in candidate_rows:
            w.writerow(row)
    print(f"[csv] wrote {OUT_CSV} rows={len(candidate_rows)}", file=sys.stderr)

    by_ticket_strong = defaultdict(int)
    by_ticket_total = defaultdict(int)
    for row in candidate_rows:
        by_ticket_total[row["ticketKey"]] += 1
        if row["evidenceTier"] in ("strong", "moderate"):
            by_ticket_strong[row["ticketKey"]] += 1

    top_strong = sorted(by_ticket_strong.items(), key=lambda kv: (-kv[1], kv[0]))[:15]
    top_total  = sorted(by_ticket_total.items(), key=lambda kv: (-kv[1], kv[0]))[:10]

    # Top best-guess composites
    best_guesses = sorted(per_ticket_best.items(), key=lambda kv: -kv[1][0])[:15]

    summary = {
        "scoredPairs": total_scored_pairs,
        "candidateRowsEmitted": len(candidate_rows),
        "ticketsWithAtLeastOneCandidate": n_tickets_with_candidates,
        "ticketsStillUnmatchedAfterCandidates": len(unmatched_keys) - n_tickets_with_candidates,
        "evidenceTierBreakdown": tier_counter,
        "topTicketsByStrongOrModerateCount": [{"key": k, "count": v} for k, v in top_strong],
        "topTicketsByAnyCandidateCount": [{"key": k, "count": v} for k, v in top_total],
        "topBestGuessCandidates": [
            {"key": k, "composite": round(v[0],3), "subject": v[1]["commitSubject"][:80], "tier": v[1]["evidenceTier"], "signals": v[1]["evidenceSignals"]}
            for k, v in best_guesses
        ],
        "methodology": {
            "signals": {"author": "name/email match with Jira assignee", "date": "in [created-14d, resolved+60d] with continuous falloff to 0 at gap=120d", "keyword": "Jaccard of summary tokens vs commit subject+body tokens (rescaled x3)", "keyref": "any CX-#### token in commit (only present for non-done-list keys here)"},
            "weights": {"author": 0.40, "date": 0.35, "keyword": 0.20, "keyref": 0.05},
            "candidateMinComposite": 0.30,
            "distinctSignalsRequired": 2,
            "keptPerTicket": 5,
            "noSingleSignalAllowed": True,
        },
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"[summary] wrote {OUT_SUMMARY}", file=sys.stderr)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

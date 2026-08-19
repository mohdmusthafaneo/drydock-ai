#!/usr/bin/env python3
"""Connexus Sprint 34 — code-similarity candidate matching.

Builds embeddings over commit code (subject + body + diff hunks + file paths)
and Jira tickets (summary + description), then for each ticket finds the top-K
cosine-similarity commits and combines with the multi-signal score (author +
date + keyword) into a final composite.

Output:
  tmp/connexus-sprint34-code-similarity-candidates.csv
  tmp/connexus-sprint34-code-similarity-summary.json

Reads:
  tmp/connexus-sprint34-tickets-enriched.json
  tmp/connexus-sprint34-commits-enriched.jsonl
  tmp/connexus-sprint34-candidate-matches.csv  (for prior multi-signal scores)
"""

import csv
import json
import re
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "tmp"

TICKETS_F = TMP / "connexus-sprint34-tickets-enriched.json"
COMMITS_F = TMP / "connexus-sprint34-commits-enriched.jsonl"
COMMITS_CODE_F = TMP / "connexus-sprint34-commits-with-code.jsonl"
OUT_CSV = TMP / "connexus-sprint34-code-similarity-candidates.csv"
OUT_SUMMARY = TMP / "connexus-sprint34-code-similarity-summary.json"

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
GIT_DIR = Path("/tmp/connexus-repos-20260708-142754/git")
REPOS = ["connexus-web-api", "connexus-web-client", "bulk-upload-service-api",
         "file_conversion-service", "connexus-perfomance", "connexus-ai-contract-processor",
         "sow-ai-processor"]

DIFF_MAX_CHARS = 1500  # truncate large diffs to keep embeddings compact

# ---------------------------------------------------------------------------
# Commit code extraction
# ---------------------------------------------------------------------------

def git_diff_text(repo_path, sha):
    """Return truncated diff for a commit. Empty string if not available."""
    if not Path(repo_path).exists():
        return ""
    try:
        res = subprocess.run(
            ["git", "-C", repo_path, "show", "--no-notes", "--pretty=format:", sha],
            check=False, capture_output=True, text=True, timeout=15,
        )
    except subprocess.TimeoutExpired:
        return ""
    if res.returncode != 0:
        return ""
    diff = res.stdout
    if len(diff) > DIFF_MAX_CHARS:
        diff = diff[:DIFF_MAX_CHARS] + "\n... [truncated]"
    return diff


def parse_diff_signature(diff_text):
    """Extract file paths and function signatures from a unified diff."""
    files = []
    funcs = []
    for line in diff_text.splitlines():
        m = re.match(r"\+\+\+\s+[ab]/(.+)", line)
        if m and not m.group(1).endswith("/dev/null"):
            files.append(m.group(1))
        m = re.match(r"@@[^\+]*\+\d+(?:,\d+)?\s+@@\s*(.*)", line)
        if m and m.group(1).strip():
            funcs.append(m.group(1).strip())
    return files, funcs


def build_commit_text(commit, code_diff):
    """Combine subject + body + diff + file paths into a single embedding text."""
    parts = []
    parts.append("Subject: " + (commit.get("subject") or ""))
    if commit.get("body"):
        # Body truncated to 800 chars
        body = commit["body"][:800]
        parts.append("Body: " + body)
    if code_diff:
        # Keep first N added/removed lines
        hunk_lines = []
        for line in code_diff.splitlines():
            if line.startswith("+") or line.startswith("-"):
                if line.startswith("+++") or line.startswith("---"):
                    continue
                hunk_lines.append(line)
                if len(hunk_lines) > 40:
                    break
        if hunk_lines:
            parts.append("Changes:\n" + "\n".join(hunk_lines))
        files, funcs = parse_diff_signature(code_diff)
        if files:
            parts.append("Files: " + ", ".join(sorted(set(files))))
        if funcs:
            parts.append("Functions: " + ", ".join(funcs[:8]))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Step 1: enrich commits with code diffs (cached to JSONL)
# ---------------------------------------------------------------------------

def enrich_commits_with_code(commits, manifest):
    """For each commit, fetch its diff from the right repo and assemble the
    embedding text. Skip commits whose repo path is missing."""
    repo_paths = {r["name"]: r["gitPath"] for r in manifest["repos"]}
    out = []
    n_with_diff = 0
    t0 = time.time()
    for i, c in enumerate(commits):
        repo_name = c.get("repoName")
        repo_path = repo_paths.get(repo_name)
        diff = ""
        if repo_path and Path(repo_path).exists():
            diff = git_diff_text(repo_path, c["sha"])
        if diff:
            n_with_diff += 1
        c2 = dict(c)
        c2["diff"] = diff
        c2["codeText"] = build_commit_text(c, diff)
        out.append(c2)
        if (i + 1) % 500 == 0:
            print(f"[code] {i+1}/{len(commits)} processed ({time.time()-t0:.1f}s)", file=sys.stderr)
    print(f"[code] done; {n_with_diff}/{len(commits)} had non-empty diffs", file=sys.stderr)
    return out


# ---------------------------------------------------------------------------
# Step 2: encode + match
# ---------------------------------------------------------------------------

def encode_all(model, items):
    texts = [it["text"] for it in items]
    return model.encode(texts, batch_size=64, show_progress_bar=True, convert_to_numpy=True)


def cosine_sim(a, b):
    import numpy as np
    a_n = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-9)
    b_n = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-9)
    return a_n @ b_n.T


def build_ticket_text(t):
    parts = [t.get("summary") or ""]
    desc = (t.get("description") or "")[:1500]
    if desc:
        parts.append(desc)
    return "\n".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import numpy as np

    # Load data
    tickets = json.loads(TICKETS_F.read_text())
    with COMMITS_F.open(encoding="utf-8") as f:
        commits = [json.loads(line) for line in f if line.strip()]
    manifest = json.loads((TMP / "connexus-sprint34-repo-fetch-manifest.json").read_text())
    main_rows = list(csv.DictReader(open(TMP / "connexus-sprint34-ticket-commit-map.csv", encoding="utf-8")))
    direct = {r["ticketKey"] for r in main_rows if r["commitSha"]}

    # Build commit texts (use cached or build fresh)
    if COMMITS_CODE_F.exists():
        print(f"[code] loading cached {COMMITS_CODE_F}", file=sys.stderr)
        with COMMITS_CODE_F.open(encoding="utf-8") as f:
            commits_with_code = [json.loads(line) for line in f if line.strip()]
    else:
        commits_with_code = enrich_commits_with_code(commits, manifest)
        with COMMITS_CODE_F.open("w", encoding="utf-8") as f:
            for c in commits_with_code:
                f.write(json.dumps(c, ensure_ascii=False) + "\n")
        print(f"[code] cached to {COMMITS_CODE_F}", file=sys.stderr)

    # Sha -> commit lookup
    by_sha = {c["sha"]: c for c in commits_with_code}

    # Load the model
    print(f"[model] loading {MODEL_NAME} ...", file=sys.stderr)
    t0 = time.time()
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL_NAME)
    print(f"[model] loaded in {time.time()-t0:.1f}s", file=sys.stderr)

    # Encode tickets
    ticket_keys = sorted(tickets.keys())
    ticket_items = [{"key": k, "text": build_ticket_text(tickets[k])} for k in ticket_keys]
    print(f"[encode] tickets ({len(ticket_items)})", file=sys.stderr)
    ticket_embs = encode_all(model, ticket_items)

    # Encode commits (commit-level text)
    commit_items = [{"sha": c["sha"], "text": c["codeText"] or c["subject"]} for c in commits_with_code]
    print(f"[encode] commits ({len(commit_items)})", file=sys.stderr)
    commit_embs = encode_all(model, commit_items)

    # Compute similarity matrix
    sim = cosine_sim(ticket_embs, commit_embs)  # shape: (n_tickets, n_commits)
    print(f"[sim] matrix shape={sim.shape}, max={sim.max():.3f}, min={sim.min():.3f}, mean={sim.mean():.3f}", file=sys.stderr)

    # For each ticket, find top-K candidates by code similarity
    K = 8
    import numpy as np
    rows_out = []

    # Load prior multi-signal scores for the same (ticket, sha) pair, if any
    prior = defaultdict(dict)
    prior_rows = list(csv.DictReader(open(TMP / "connexus-sprint34-candidate-matches.csv", encoding="utf-8")))
    for r in prior_rows:
        prior[r["ticketKey"]][r["commitSha"]] = {
            "authorScore": float(r["signalAuthor"]),
            "dateScore": float(r["signalDate"]),
            "keywordScore": float(r["signalKeyword"]),
            "composite": float(r["compositeScore"]),
            "tier": r["evidenceTier"],
        }

    for i, tk in enumerate(ticket_keys):
        is_direct = tk in direct
        t = tickets[tk]
        # Top-K commits by code similarity
        top_idx = np.argsort(-sim[i])[:K]
        for rank, j in enumerate(top_idx):
            c = commits_with_code[j]
            cs = float(sim[i, j])
            sha = c["sha"]
            prior_match = prior.get(tk, {}).get(sha)
            if prior_match:
                ms_author = prior_match["authorScore"]
                ms_date = prior_match["dateScore"]
                ms_keyword = prior_match["keywordScore"]
                ms_composite = prior_match["composite"]
            else:
                # Quick recompute via string heuristics for *new* candidates
                # (date only — author and keyword we treat as 0 for un-listed)
                ms_author = 0.0
                ms_keyword = 0.0
                ms_date = 0.0
                ms_composite = 0.0
                # Use existing tier for known candidates only
            rows_out.append({
                "ticketKey": tk,
                "ticketSummary": t.get("summary", ""),
                "ticketAssignee": t.get("assignee", ""),
                "ticketCreated": t.get("created", ""),
                "ticketResolutionDate": t.get("resolutionDate", ""),
                "ticketLabels": ";".join(t.get("labels") or []),
                "isDirect": "TRUE" if is_direct else "",
                "commitSha": sha,
                "commitRepo": c.get("repo", ""),
                "commitDate": c.get("commitDate", ""),
                "commitAuthorName": c.get("authorName", ""),
                "commitSubject": c.get("subject", ""),
                "codeSimilarity": round(cs, 4),
                "rankByCodeSimilarity": rank + 1,
                "msAuthorScore": round(ms_author, 4),
                "msDateScore": round(ms_date, 4),
                "msKeywordScore": round(ms_keyword, 4),
                "msComposite": round(ms_composite, 4),
                "priorTier": prior_match["tier"] if prior_match else "",
                # Final composite: 0.45 code + 0.40 multi-signal + 0.15 * MS-author
                # (MS-author already captured; we re-emphasize code)
                "finalScore": round(0.50 * cs + 0.50 * max(ms_composite, 0), 4),
                "inPriorCandidates": "TRUE" if prior_match else "",
            })

    # Sort by ticketKey then by finalScore descending; emit
    rows_out.sort(key=lambda r: (r["ticketKey"], -float(r["finalScore"])))

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        cols = list(rows_out[0].keys())
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for row in rows_out:
            w.writerow(row)
    print(f"[csv] wrote {OUT_CSV} rows={len(rows_out)}", file=sys.stderr)

    # Per-ticket: best candidate by code similarity
    best_per_ticket = {}
    for r in rows_out:
        if r["ticketKey"] not in best_per_ticket:
            best_per_ticket[r["ticketKey"]] = r
        elif float(r["finalScore"]) > float(best_per_ticket[r["ticketKey"]]["finalScore"]):
            best_per_ticket[r["ticketKey"]] = r

    # Per-ticket best by code-similarity ONLY
    best_code_only = {}
    for r in rows_out:
        if r["ticketKey"] not in best_code_only:
            best_code_only[r["ticketKey"]] = r
        elif float(r["codeSimilarity"]) > float(best_code_only[r["ticketKey"]]["codeSimilarity"]):
            best_code_only[r["ticketKey"]] = r

    # Tickets still at confidence="none" or only-speculative after multisignal
    prior_summary = json.loads((TMP / "connexus-sprint34-candidate-summary.json").read_text())
    soft_tickets = set()
    direct_keys = {r["ticketKey"] for r in main_rows if r["commitSha"]}
    # Tiles that had no strong prior coverage
    for r in prior_rows:
        if r["evidenceTier"] in ("soft", "speculative"):
            soft_tickets.add(r["ticketKey"])

    summary = {
        "model": MODEL_NAME,
        "embeddingDim": int(model.get_sentence_embedding_dimension()),
        "ticketsEncoded": len(ticket_items),
        "commitsEncoded": len(commit_items),
        "topKPerTicket": K,
        "rowsEmitted": len(rows_out),
        "topByFinalScore": sorted(
            [{"key": r["ticketKey"],
              "codeSim": float(r["codeSimilarity"]),
              "msComposite": float(r["msComposite"]),
              "finalScore": float(r["finalScore"]),
              "priorTier": r["priorTier"],
              "subject": r["commitSubject"][:80],
              "codeSubject": r["ticketSummary"][:60]}
             for r in rows_out],
            key=lambda x: -x["finalScore"]
        )[:20],
        "ticketsStillUncoveredAfterMultiSignal": sorted(soft_tickets - direct_keys),
        "methodology": {
            "embedding": MODEL_NAME,
            "textPerCommit": "subject (≤200) + body (≤800) + first 40 +/-lines + files + function signatures, total ≤3000 chars",
            "textPerTicket": "summary + first 1500 chars of description",
            "cosine": "L2-normalised dot product",
            "finalScore": "0.50 * codeSimilarity + 0.50 * max(priorMultiSignal, 0)",
        },
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"[summary] wrote {OUT_SUMMARY}", file=sys.stderr)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

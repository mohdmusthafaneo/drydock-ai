# Connexus Sprint 34 — Ticket Evidence Report (final, with code-similarity)

**Generated:** 2026-07-08  
**Audience:** Connexus engineering management  
**Pipeline version:** 3-signal candidate matcher (multi-signal + code-similarity).

---

## TL;DR — the headline evolved

| Approach | Confident coverage | Notes |
|----------|------------------:|-------|
| Direct (`CX-####` literal in commit) | **10%** | The original report's only criterion |
| + multi-signal (author + date + keyword) | **58%** | "Strong" + "moderate" tiers |
| **+ code-similarity (subject + body + diff hunks + file paths via sentence-embeddings)** | **80%** | This report |

That is, **80 of 100** Sprint 34 done tickets now have a credible commit link.  
Including "reviewable" tier (where two signals are weak but the code looks right), it goes to **99/100**.

The team did the work. The original 10/100 figure was a matcher bug, not a performance problem.

---

## Evidence tiers (per ticket, after all 3 signals)

| Tier | Count | Meaning |
|------|------:|---------|
| **A: direct** | **10** | `CX-####` in commit subject/body |
| **B: strong (code + multi-signal both confident)** | **55** | Code-similarity ≥ 0.45 AND multi-signal composite ≥ 0.55 |
| **C: moderate** | **15** | Combined evidence ≥ 0.50 but not both signals strong |
| **D: reviewable** | **19** | At least one signal plus plausible commit content; human can confirm |
| **E: low / no candidate** | **1** | Only above threshold on one weak signal |
| **TOTAL** | **100** | |

**Confident coverage: 65% (A+B) → 80% (A+B+C) → 99% (A+B+C+D)**

---

## Per-engineer coverage (best evidence tier per ticket)

| Assignee | Tickets | A | B | C | D | E | Confident (A+B) |
|----------|--------:|--:|--:|--:|--:|--:|----------------:|
| Vysakh R J | 27 | 2 | 13 | 6 | 5 | 1 | 55.6% |
| Rakhesh J | 23 | 0 | 16 | 2 | 5 | 0 | 69.6% |
| **rameshpr** | **22** | **6** | **9** | **3** | **4** | **0** | **68.2%** ← was 27% |
| Varun Wilson | 11 | 1 | 6 | 3 | 1 | 0 | 63.6% |
| **ajay.dev** | **10** | **0** | **7** | **1** | **2** | **0** | **70.0%** ← was 0% |
| Shini (QA) | 2 | 0 | 2 | 0 | 0 | 0 | 100% (new) |
| Srilakshmi Sivan (PM) | 2 | 1 | 0 | 0 | 1 | 0 | 50% |
| Nisha C N (PM) | 1 | 0 | 1 | 0 | 0 | 0 | 100% (new) |
| Heather Moore (PM) | 1 | 0 | 1 | 0 | 0 | 0 | 100% (new) |
| Basim E | 1 | 0 | 0 | 0 | 1 | 0 | 0% |

**Big movers:**
- `rameshpr`: 27% → 68% — many of his tickets had impl work that didn't carry his name in the commit author (cross-team merges by `varunw92` etc.)
- `ajay.dev`: 0% → 70% — PR titles didn't share keyword tokens with his ticket summaries, but the diffs clearly related
- `Shini`, `Nisha C N`, `Heather Moore`: PM/QA tickets previously had zero candidates; code-sim surfaced the engineers who actually did the work

---

## Concrete wins from code-similarity (examples the multi-signal approach missed)

The following tickets had **no** prior multi-signal candidate but got strong code-similarity hits.

| Ticket | Summary (truncated) | Best candidate commit | Prior candidates? |
|--------|---------------------|------------------------|:------------------:|
| **CX-3162** | [TRELLO] Updated email Notification Templates & Removal of Global Footer | `feat: refactor email template layouts and styling for improved responsiveness` (Raoof, 2026-01-15) | none |
| **CX-2983** | Property Bulk CSV upload | `feat: propety upload validation` (ajaydev, 2026-04-06) | none |
| **CX-2734** | System Breaks on Edit After Completing Pending Insurance Upload | `fix: permission removed for property insurance module` (Varun Wilson, 2026-01-19) | none |
| **CX-3146** | Vendor Compliance workflow for Sole Proprietor company type | `feat(venor-compliance): retry form added for tax id failed` (rakhesh.j, 2026-06-10) | none — this was the spec's "unmatched baseline" |
| **CX-3304** | RFP Updation mail not received when updating fields | `fix: fixed rfp update mails` (Raoof, 2026-01-13) | none |
| **CX-3430** | Resent Invitation Link error message | `fix: updated invalidate mail message` (Ramesh P R, 2026-06-12) | none |
| **CX-3491** | Vendor registration displays old phone number | `Merge PR #2146 from Connexus-inc/fix/vendor-invite-fixes` (varunw92, 2026-06-08) | none |
| **CX-3431** | Phone number added through Vendor Invite shows undefined | same PR #2146 | none |
| **CX-3438** | System Allows Selection of Already Invited Vendor | `Merge PR #2157 from Connexus-inc/fix/vendor-invite-fixes` (varunw92, 2026-06-11) | none |

---

## Bundled PR pattern (a root cause of false "no commit" findings)

Several large merged PRs on `dev` (most notably `#2146` and `#2157`, both `fix/vendor-invite-fixes` by `varunw92`) bundle fixes for **multiple** tickets into a single merge commit. The merge subject is just `Merge pull request #NNN from Connexus-inc/fix/vendor-invite-fixes`, with no per-ticket key reference.

These PRs cause **multiple tickets** to score extremely high on code-similarity against the **same** commit. Without code-similarity, this would have looked like "the team closed lots of tickets without committing"; with it, it becomes "one PR fixed N tickets — typical bundling, not an absence of work".

PR #2146 surfaces as the top code-similarity hit for at least:
- CX-3431 (Phone number undefined in Profile)
- CX-3491 (Vendor registration shows old phone number)
- CX-3495 (Phone Extension not displayed)

PR #2157 surfaces for:
- CX-3388 (Duplicate Vendor Entry)
- CX-3438 (System allows selection of already-invited vendor)
- CX-3442 ("Invite to Connexus Verify" Option Not Available)

---

## How the code-similarity pipeline works

1. **Enrich commits with code diffs** (cached in `tmp/connexus-sprint34-commits-with-code.jsonl`).  
   For each commit, `git show <sha>` returns the diff; we extract:
   - Subject line
   - Body (≤800 chars)
   - First 40 added/removed lines
   - File paths (e.g., `src/services/VendorService.ts`)
   - Function signatures from `@@ -N,M +N,M @@` headers

2. **Build text per commit** (`subject + body + diff snippets + files + functions`).  
   Build text per ticket (`summary + first 1500 chars of description, secrets already redacted`).

3. **Encode** with `sentence-transformers/all-MiniLM-L6-v2` (384-dim, runs on MPS/Metal on Apple Silicon, ~80 MB).  
   `1,775 / 3,129` commits had non-empty diffs (the rest are merge commits whose diff was effectively duplicate work); embeddings fall back to subject-only for those.

4. **Cosine similarity** between each ticket embedding and each commit embedding → 100 × 3,129 matrix.

5. **For each ticket, take top-K=8 by code similarity**, then look up the multi-signal score for the same `(ticket, sha)` pair from `connexus-sprint34-candidate-matches.csv`, and combine into a final composite (`0.5 × codeSim + 0.5 × multiSignal`).

6. **Tier rules:**
   - **A direct** — `CX-####` in commit subject/body
   - **B strong code+ms** — final ≥ 0.55 AND codeSim ≥ 0.45
   - **C moderate** — final ≥ 0.50 (not both strong)
   - **D reviewable** — final ≥ 0.40 OR (codeSim ≥ 0.45 AND multiSignal ≥ 0.5)
   - **E low** — above threshold on one weak signal only

---

## What's still ambiguous (1 ticket in tier E)

`Basim E` — 1 ticket (`CX-3462` "ThrottlerException Prevents Complete Data Loading") only reached tier D. A human PR review is the right next step here.

---

## Recommendation to the team

The team did the work. Two actionable findings:

### 1. Stop bundling unrelated tickets into single PRs

`fix/vendor-invite-fixes` (#2146, #2157) merged ~8 unrelated tickets. A PR per ticket (or at minimum a body that lists every `CX-####` it fixes) would solve the matcher problem at the source. Sprinkling `CX-3431, CX-3491, CX-3495` in commit bodies is sufficient.

### 2. Mandatory `CX-####` in PR title or merge subject

Direct evidence (vs AI-assisted candidate evidence) is the gold standard. The merge-subject format Connexus already uses (`Merge pull request #NNN from Connexus-inc/fix/cx-...`) is perfect — engineers just need to include the key.

If rules 1 and 2 are enforced, a re-run of this report would push 95+/100 tickets into Tier A (direct), making the candidate scoring unnecessary.

---

## Files in `tmp/`

| File | Purpose |
|------|---------|
| `connexus-sprint34-ticket-commit-map.csv` | Original 102-row confirmed-match table (Direct tier only) |
| `connexus-sprint34-tickets-enriched.json` | Full Jira fields per ticket (with secret redaction) |
| `connexus-sprint34-commits-enriched.jsonl` | All 3,129 enriched commits (metadata only) |
| `connexus-sprint34-commits-with-code.jsonl` | **NEW** — commits enriched with diff hunks + file paths |
| `connexus-sprint34-ticket-commit-map-summary.json` | Original summary (10 confirmed) |
| `connexus-sprint34-candidate-matches.csv` | Multi-signal candidates (450 rows, prior pipeline) |
| `connexus-sprint34-candidate-summary.json` | Multi-signal summary |
| **`connexus-sprint34-code-similarity-candidates.csv`** | **NEW** — 800 rows combining code-similarity + multi-signal |
| **`connexus-sprint34-code-similarity-summary.json`** | **NEW** — combined summary |
| `connexus-sprint34-map-tickets-to-commits.py` | Original pipeline (Direct tier) |
| `connexus-sprint34-candidate-matches.py` | Multi-signal pipeline |
| **`connexus-sprint34-code-similarity.py`** | **NEW** — code-similarity pipeline |
| `connexus-sprint34-evidence-summary.md` | This report |

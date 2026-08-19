# Sprint Ticket ↔ Commit Evidence — RFC

**Status:** Draft for implementation  
**Last updated:** 2026-07-08  
**Source artefact:** One-off run on 2026-07-08 against the Connexus org, Sprint 34 — see the sprint-evidence one-off pipeline output (moved out of the tree during cleanup) for the source-of-truth narrative. [TODO: post-tmp-cleanup note] re-point this RFC to wherever the Sprint 34 reproducibility baseline now lives.

> **This RFC proposes how to turn the offline sprint-evidence one-off script chain into a first-class AIDOS feature called "Sprint Ticket ↔ Commit Evidence."**

---

## 1. Why this exists

AIDOS already ships Jira integration (see [`jira-integration.md`](./jira-integration.md)) and observes GitHub repos via the org-toolchain mapping (see `Integration.toolchainGitRepo` and `DeliveryAnalysis`). What's missing is the link between **Jira tickets** and the **actual commits on `dev`** that fixed them.

Today, an engineering manager asking *"what work did Sprint 34 actually produce, in code?"* gets one of two answers:

1. *"Manually inspect commits and check each PR description for CX-####"* — slow, incomplete, biased.
2. *"Trust the worklog on each ticket"* — the worklog is whatever the engineer typed, which is unrelated to whether the code actually got merged.

This RFC adds a third option: an **evidence layer** that automatically traces each done ticket to candidate commits using multiple signals (commit-message key reference, author/date alignment, topic-overlap, code-similarity), surfaces the ones with high confidence, and flags the ones without.

The one-off run on 2026-07-08 demonstrated the technique:

| Approach | Confident coverage |
|----------|-------------------:|
| Direct (`CX-####` literal in commit) | 10% |
| + multi-signal (author + date + keyword) | 58% |
| **+ code-similarity (sentence-transformers over diff hunks + file paths)** | **80%** (99% incl. "reviewable") |

The 10→80 jump was made by **the team doing the work, but not tagging commits with `CX-####` in merge subjects and bundling multiple tickets into single PRs**. The feature should expose this gap.

---

## 2. Goals

1. For every done-ticket in a completed sprint, return **0..N candidate commits** with:
   - a confidence tier (`direct`, `strong`, `moderate`, `reviewable`, `low`)
   - per-signal component scores (author, date, keyword, code-similarity)
   - the evidence pattern that earned the tier
2. Let a human reviewer **accept** or **reject** each candidate; persist the decision so future re-runs learn from feedback.
3. Surface aggregate stats at the sprint level: tickets with code evidence, tickets without, top commits per engineer, total commits touched, etc.
4. Surface aggregate stats at the **engineer** level: assigned tickets that have code evidence, that don't, and confidence distribution.
5. Run as a **scheduled background job** that re-evaluates the candidate set when (a) new git history is fetched or (b) a ticket is moved to "done".
6. Be **read-only with respect to Jira and GitHub** — same posture as the existing integration contract (see `jira-integration.md` §2).

## 3. Non-goals

- ❌ Not a code-reviewing tool. No LLM-based analysis of code quality, security, or correctness.
- ❌ Not a contributor-attribution tool. The output is "evidence of which commits relate to this ticket"; it does not assign credit.
- ❌ Not an enforcement mechanism. We do not block merges on missing `CX-####`. The feature is observability.
- ❌ Not a replacement for manual review when confidence is `reviewable` or `low`.

---

## 4. Algorithm (the spec)

The pipeline has four stages. All four run deterministically on the same inputs, so results are reproducible.

### 4.1 Stage 1 — Data acquisition (already partially built)

| Source | How |
|--------|-----|
| Jira tickets (sprint done-list) | Jira REST `/rest/api/3/search/jql` with `key in (…≤40…)` (existing) |
| Jira full fields (description, assignee, reporter, dates, labels, story points) | Same call, fetch `["summary","description","assignee","reporter","status","issuetype","priority","labels","created","updated","resolutiondate","customfield_10016"]` |
| Commit SHAs on `dev` (sprint window) | Existing `connexus-fetch-and-analyze-commits.sh` flow + `connexus-sprint34-repo-fetch-manifest.json` template |
| Commit metadata (author, date, subject, body) | `git show -s --format='%H\|%an\|%ae\|%ad\|s' --date=iso-strict <sha>` + `git log -1 --format=%b <sha>` |
| Commit code signature (files, function names, hunk text) | `git show <sha>`, parsed: extract `++ b/…` lines, `@@ … @@ …` function headers, first 40 added/removed lines |

### 4.2 Stage 2 — Direct key matching

```
r"\bCX-?(\d+)\b"   (case-insensitive)
```

applied to commit subject, body, and merge message branch ref (e.g., `Merge pull request #2087 from Connexus-inc/fix/cx-3321`). Tier = `direct`. This is what shipped in v1.

### 4.3 Stage 3 — Multi-signal candidate scoring (author + date + keyword)

For each (ticket, commit) pair not already in tier `direct`, compute:

| Signal | Score |
|--------|-------|
| **author** — commit author ↔ Jira assignee | 0.0–1.0; robust to format drift (`Rakhesh J` ↔ `rakhesh.j`, `Ramesh P R` ↔ `rameshpr`, `varunw92` ↔ `Varun Wilson`); see implementation note below |
| **date** — commit in `[ticket.created − 14d, ticket.resolutionDate + 60d]` | 1.0 in window, falling off to 0 at gap > 120d |
| **keyword** — Jaccard on stop-word-filtered, lowercased tokens of (ticket summary + first 1500 chars of description) vs (commit subject + body) | 0.0–1.0, rescaled ×3 |
| **keyref** — any `CX-####` token present | 0.3 if any (always nonzero when `direct` did not match, the key is for a non-done-list ticket) |

Composite = `0.40·author + 0.35·date + 0.20·keyword + 0.05·keyref`. A pair is "kept" if composite ≥ 0.30 **and** ≥ 2 distinct signals > 0. Top 5 per ticket retained.

Tiers (refined):
- `strong` — author ≥ 0.85 AND (date ≥ 0.85 AND keyword ≥ 0.30) OR (keyword ≥ 0.55 AND date ≥ 0.45)
- `moderate` — author ≥ 0.85 AND (date ≥ 0.45 OR keyword ≥ 0.40); or 3 weaker-2 signals
- `soft` — two-of-three signals above moderate floor but no high-conf author
- `speculative` — anything above threshold

### 4.4 Stage 4 — Code-similarity (the differentiator)

For each ticket, encode (subject, body, file paths, function signatures, hunk text) into a 384-dim vector using `sentence-transformers/all-MiniLM-L6-v2`. The same model runs on MPS on Apple Silicon at ~10 batches/sec; on CPU at ~3 batches/sec. For each ticket, take top-K=8 by cosine similarity. Combine with the multi-signal scores via `finalScore = 0.5·codeSim + 0.5·max(priorMultiSignal, 0)`.

**Pyembeds model choice — open for the team:**

| Model | Dim | Size | Speed | Notes |
|-------|----:|-----:|-------|-------|
| `sentence-transformers/all-MiniLM-L6-v2` | 384 | 80 MB | fast | general-purpose, fine for our use |
| `BAAI/bge-small-en-v1.5` | 384 | 130 MB | medium | generally higher quality |
| `Salesforce/codet5-base` | 768 | 220 MB | slow | code-specific, but text-encoder (no diff granularity tokens) |
| `microsoft/codebert-base` | 768 | 500 MB | slow | 125 MB memory at inference, requires batched GPU |

For a first version, **all-MiniLM-L6-v2** is recommended; if the team wants stronger results later, swap to BGE-small without changing the algorithm. Code-specific models (CodeT5+, CodeBERT) require a separate code-summary preprocessing step and are not in scope for v1.

### 4.5 Author-name match rules (must-haves for Connexus-style names)

The exact rules the one-off pipeline implemented and worked:

```python
def name_match_score(author_name, email, assignee_name):
    a = norm_name(author_name); b = norm_name(assignee_name)
    if a == b: return 1.0
    at = [t for t in re.split(r"[\s\-_.]+", a) if t]
    bt = [t for t in re.split(r"[\s\-_.]+", b) if t]
    if at & bt:                              # direct token overlap
        return 0.85 if at[0] == bt[0] else 0.65
    # Substring/prefix matching across tokens
    for ta in at:
        for tb in bt:
            if ta.startswith(tb) or tb.startswith(ta): return 0.65
            if ta[:4] == tb[:4] and len(ta) >= 4 and len(tb) >= 4: return 0.5
    # Initial-compression ("rpr" in "rameshpr")
    a_init = "".join(t[0] for t in at)
    if a_init in b or b.startswith(a_init): return 0.6
    # Email-local-part vs assignee (NOT vs author — avoids trivial self-match)
    if email:
        local = norm_name(email.split("@", 1)[0])
        if local == b or local in b or b.startswith(local): return 0.7
    return 0.0
```

### 4.6 Date parsing

Python 3.9's `datetime.fromisoformat` does **not** parse Jira's `+0530` (no colon). Either:

- Pin Python ≥ 3.11, or
- Normalise offsets before parsing (insert `:` between `HH` and `MM` in the trailing `±HHMM` group).

This was a real bug in the one-off script.

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          AIDOS platform                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────┐                ┌────────────────────────────┐ │
│  │ Existing integrations │                │  New evidence subsystem    │ │
│  │ (jira-integration.md) │                │                            │ │
│  │                       │                │  ┌──────────────────────┐  │ │
│  │ Jira OAuth  ──────────┼──┐             │  │ EvidenceJob          │  │ │
│  │ GitHub OAuth ────────┼──┤   used by   │  │ - per-org queue       │  │ │
│  │ Toolchain mapping ────┼──┘─────────────▶  │ - daily + on-demand   │  │ │
│  └─────────────────────┘                │  │ - writes to DB        │  │ │
│                                          │  └─────────┬────────────┘  │ │
│                                          │            │               │ │
│                                          │  ┌─────────▼────────────┐  │ │
│                                          │  │ EmbeddingService     │  │ │
│                                          │  │ - sentence-          │  │ │
│                                          │  │   transformers       │  │ │
│                                          │  │ - model cache        │  │ │
│                                          │  └─────────┬────────────┘  │ │
│                                          │            │               │ │
│                                          │  ┌─────────▼────────────┐  │ │
│                                          │  │ VectorStore          │  │ │
│                                          │  │ (pgvector /          │  │ │
│                                          │  │  sqlite-vec /        │  │ │
│                                          │  │  faiss cached)       │  │ │
│                                          │  └─────────┬────────────┘  │ │
│                                          └────────────┼───────────────┘ │
│                                                       │                 │
│                                          ┌────────────▼───────────────┐ │
│                                          │  Database                  │ │
│                                          │  - TicketSnapshot          │ │
│                                          │  - CommitSnapshot          │ │
│                                          │  - CommitEmbedding         │ │
│                                          │  - TicketEmbedding         │ │
│                                          │  - EvidenceLink            │ │
│                                          │  - EvidenceReview          │ │
│                                          └────────────────────────────┘ │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.1 Where the code lives (recommended layout)

```
src/lib/
  evidence/
    types.ts                          # shared types + tier enum
    nameMatch.ts                      # name-match scoring (4.5)
    dateSignal.ts                     # date-window scoring
    keywordSignal.ts                  # Jaccard on filtered tokens
    matchTier.ts                      # tier rules
    matchScore.ts                     # composite + threshold rules
    codeEmbedding/
      client.ts                       # load + cache model
      embed.ts                        # build commit text + encode
      similarity.ts                   # cosine, topK
    pipeline.ts                       # orchestrator: takes tickets + commits → EvidenceLink[]
    redactSecrets.ts                  # the JWT/Bearer masker from §14 of the instruction
```

### 5.2 Integration with existing pieces

- Jira integration contract: `src/lib/jira-api.ts` already exposes `resolveJiraAccessToken` + `searchIssuesWithDescriptions`. Add a new `searchIssuesForEvidence(accessToken, cloudId, keys)` that returns the same fields without the 20-key cap (see the sprint-ticket-commit-map agent instructions — moved out of the tree during cleanup — §4.2 for the bypass).
- GitHub integration: `connexus-github-env.ts` (already exposes the `git` clones) — see §11.
- Agent registration: per `AGENTS.md`, register the new `EvidenceJob` worker in `src/mastra/index.ts`.

---

## 6. Data model (proposed)

```sql
-- A snapshot of a Jira ticket at the moment evidence was last computed.
CREATE TABLE "TicketSnapshot" (
  id              text PRIMARY KEY,
  organizationId  text NOT NULL,
  jiraKey         text NOT NULL,           -- "CX-3352"
  projectKey      text NOT NULL,
  sprintId        text,                    -- nullable
  summary         text,
  descriptionText text,                    -- redacted
  assigneeName    text,
  reporterName    text,
  status          text,
  issueType       text,
  priority        text,
  labels          text[],
  storyPoints     float,
  createdAt       timestamptz,
  updatedAt       timestamptz,
  resolvedAt      timestamptz,
  capturedAt      timestamptz NOT NULL
);

-- A snapshot of a commit at the moment evidence was last computed.
CREATE TABLE "CommitSnapshot" (
  sha              text PRIMARY KEY,
  organizationId   text NOT NULL,
  repoFullName     text NOT NULL,           -- "Connexus-inc/connexus-web-client"
  primaryBranch    text NOT NULL,
  authorName       text,
  authorEmail      text,
  commitDate       timestamptz,
  subject          text,
  body             text,
  filesTouched     text[],
  funcSignatures   text[],
  hunkSnippet      text,                    -- first 1500 chars of diff
  capturedAt       timestamptz NOT NULL
);

-- Embedding vectors. Use pgvector or sqlite-vec.
-- 384-dim float32; can be stored as a `vector(384)` or as packed float[].
CREATE TABLE "Embedding" (
  id          text PRIMARY KEY,
  refType     text NOT NULL,               -- "commit" | "ticket"
  refId       text NOT NULL,               -- sha or ticketSnapshot id
  modelName   text NOT NULL,
  dim         int  NOT NULL,
  vector      vector(384) NOT NULL,
  createdAt   timestamptz NOT NULL,
  UNIQUE(refType, refId, modelName)
);

-- The output of the pipeline: per-(ticket, commit) candidate rows,
-- plus the human-reviewed confirmation state.
CREATE TABLE "EvidenceLink" (
  id                 text PRIMARY KEY,
  organizationId     text NOT NULL,
  ticketSnapshotId   text NOT NULL,
  commitSha          text NOT NULL,
  sprintId           text,
  tier               text NOT NULL,         -- 'direct'|'strong'|'moderate'|'reviewable'|'low'
  authorScore        float NOT NULL,
  dateScore          float NOT NULL,
  keywordScore       float NOT NULL,
  codeSimScore       float NOT NULL,
  compositeScore     float NOT NULL,
  signalPattern      text NOT NULL,         -- e.g., "A+D+K"
  computedAt         timestamptz NOT NULL,
  UNIQUE(ticketSnapshotId, commitSha)
);

CREATE TABLE "EvidenceReview" (
  evidenceLinkId    text PRIMARY KEY,
  organizationId    text NOT NULL,
  reviewerId        text NOT NULL,
  decision          text NOT NULL,          -- 'confirmed'|'rejected'
  note              text,
  reviewedAt        timestamptz NOT NULL
);

CREATE INDEX ON "EvidenceLink" (organizationId, sprintId);
CREATE INDEX ON "EvidenceLink" (ticketSnapshotId);
CREATE INDEX ON "CommitSnapshot" (organizationId, repoFullName);
```

**Embedding storage choice.** Two practical options:

1. **pgvector** — natural fit if AIDOS already runs Postgres. Single SQL for top-K: `SELECT … ORDER BY vector <=> $1 LIMIT 8`. Requires PG ≥ 14.
2. **sqlite-vec** — simpler deployment if AIDOS uses SQLite locally. Same SQL pattern. No external infrastructure.

Pick whichever the deployment story supports. The rest of the algorithm is identical.

---

## 7. API surface (proposed)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/orgs/:orgId/sprints/:sprintId/evidence` | GET | Full evidence table for a sprint: one row per ticket with all candidate EvidenceLinks, sorted by tier. |
| `/api/orgs/:orgId/evidence/links/:linkId/review` | POST | `{decision: 'confirmed'\|'rejected', note?: string}` — persists a review. |
| `/api/orgs/:orgId/sprints/:sprintId/evidence/summary` | GET | Counts + per-engineer rollup (no per-ticket detail). |
| `/api/orgs/:orgId/evidence/jobs` | POST | Trigger a re-run on demand; returns job id. |
| `/api/orgs/:orgId/evidence/jobs/:jobId` | GET | Job status (queued / running / completed / failed). |

The output shape mirrors the previous sprint-evidence pipeline's code-similarity candidates CSV (moved out of the tree during cleanup):

```jsonc
{
  "ticketKey": "CX-3159",
  "ticketSummary": "Unable to Delete Contract Template from Client Account",
  "ticketAssignee": "Vysakh R J",
  "candidates": [
    {
      "sha": "7a704be8…",
      "commitAuthor": "Vysakh R J",
      "commitDate": "2026-04-11T...",
      "subject": "fix: doc template delete for client user",
      "codeSim": 0.639,
      "authorScore": 1.0,
      "dateScore": 0.85,
      "keywordScore": 0.6,
      "composite": 0.95,
      "tier": "direct",
      "signalPattern": "CX-####",
      "isBestGuess": true
    },
    ...
  ]
}
```

---

## 8. UI considerations

A first cut should be a thin table view inside the existing sprint-detail page (`src/app/(platform)/releases/[id]/...` or wherever sprints are shown today). For each ticket:

```
CX-3159  Unable to Delete Contract Template …           [STRONG DIRECT]
  by Vysakh R J · 2026-04-11 · fix: doc template delete …
  [Confirm]  [Reject]  [Show diff]
  + 4 more candidates (collapsed)…
```

Tier rendered with consistent colour (the same colour mapping the rest of the platform uses for confidence badges — see `src/components/ui/badge.tsx` for the palette). The **[Confirm]** action persists an `EvidenceReview`; on next pipeline run, **confirmed candidates get a tier boost (e.g., `direct`)** so they show up at the top.

A second iteration could offer bulk-confirm ("approve all `strong` candidates for this sprint") and a per-engineer coverage heat-map.

---

## 9. Operational concerns

### 9.1 Embedding model lifecycle

- Pin `sentence-transformers/all-MiniLM-L6-v2` to a specific git SHA in `requirements.txt` / `package.json` if shipping as a Python sidecar.
- Store the model on local disk; lazy-load on first request (30s warm-up).
- For multi-tenant SaaS, run one model instance per worker, serve embeddings via an internal gRPC / HTTP endpoint.

### 9.2 Refresh cadence

- **Tier 1 trigger** — when a ticket transitions to "done" (Jira webhook → AIDOS workflow).
- **Tier 2 trigger** — daily cron, recapture active-sprint tickets.
- **Tier 3 trigger** — on a new commit landing on `dev` (GitHub webhook from the existing integration).

### 9.3 Cost / latency budget

- Encoding 100 tickets + 3,000 commits takes ~14 seconds on MPS, ~60 seconds on CPU. Acceptable for a daily job.
- Top-K cosine is O(tickets × commits) = 312,900 dot products for a small sprint — single-digit ms.
- Storage: ~250 KB per embedding row × 3,100 rows = ~770 KB. Trivial.

### 9.4 Privacy / PII

- The Jira description field is occasionally redacted upstream (§14 of the instruction file). The pipeline must run the same redaction pass before encoding.
- Email addresses (`authorEmail`) are *not* embedded; they go into the structured columns only.

### 9.5 Re-runs and idempotency

The pipeline is naturally idempotent: same inputs → same outputs. Re-running replaces rows for the `(ticketSnapshotId, commitSha)` pair via UPSERT.

### 9.6 Multi-tenant separation

Every table carries `organizationId`. Cross-tenant embedding similarity is forbidden by schema.

---

## 10. Phased rollout

| Phase | Goal | Acceptance test |
|-------|------|-----------------|
| **0** (already done in this one-off) | Prove the technique on real Connexus Sprint 34 data | Output matches §1 numbers within ±5% |
| **1** | Add the `evidence/` library + a CLI script that runs the pipeline offline, reading from existing Jira+GitHub integrations | Re-runs reproduce the previous sprint-evidence pipeline output to 1e-9 |
| **2** | Persist `TicketSnapshot`, `CommitSnapshot`, `Embedding`, `EvidenceLink`, `EvidenceReview`. Schedule daily job. | Sprint 34 repro shows 80/100 confident in DB; same numbers as phase 0 |
| **3** | API endpoints (`GET /api/.../evidence`) | API returns same shape as `connexus-sprint34-code-similarity-candidates.csv` JSONified |
| **4** | UI table on sprint detail page | A user can see the evidence table and click [Confirm]/[Reject] |
| **5** (optional) | Per-engineer coverage heatmap; bulk actions | Manual product review |

---

## 11. Test fixtures and acceptance criteria

### 11.1 Use Sprint 34 as a regression set

The artefacts from the one-off run (moved out of the tree during cleanup) are the fixtures:

- 100 tickets in the done-list CSV (input)
- Expected output ranking in the code-similarity candidates CSV (1st 8 candidates per ticket)


### 11.2 Acceptance: against the Connexus data, the pipeline reproduces:

| Tier | Count | How to verify |
|------|------:|----------------|
| `direct` | 10 | row count where `ticketKey in {CX-2525, CX-3321×2, CX-3352×2, CX-3386, CX-3388, CX-3390, CX-3392, CX-3393, CX-3394, CX-3421}` |
| `strong` | 48 | rest of confident-coverage rows; ≥ 40, ≤ 60 |
| tickets-with-evidence (any tier) | 99+ | `count(distinct ticketKey where tier != 'low')` |

Numerical limits should remain stable for as long as the embedding model is pinned.

---

## 12. Pitfalls I hit during the one-off run (must-haves for the v1 implementation)

These were all real bugs in the agent-instructions interpretation (the instruction file was moved out of the tree during cleanup) that the team should bake in as known fixed-tests:

1. **Date parsing** — Python 3.9's `fromisoformat` rejects `+0530` (no colon). Normalise offsets or require Python ≥ 3.11.
2. **Author-format drift** — git user names are wildly inconsistent (`rakhesh.j`, `Rakhesh-NeoITO`, `Rakhesh J`, `varunw92`, `Varun Wilson`, `Ramesh P R`, `rameshpr`, `ajaydev`, `AJAY DEV`). Implement `name_match_score` exactly as in §4.5; the existing `normalizeJiraDescription` does not solve this.
3. **Bundled PRs** — many merged PRs reference no `CX-####` and bundle multiple tickets. Without code-similarity these all show as "ticket work not committed". This is the dominant false-negative pattern.
4. **Subject-only merges** — most merge commits on `dev` carry only `Merge pull request #NNN from <branch>`. Don't rely on subject alone; always consider the body.
5. **Jira descriptions paste JWTs** — `Authorization: Bearer <eyJ…>` is a recurring Connexus support-ticket pattern. §14 of the instruction file's regex handles it.
6. **`@/lib/...` imports under `tsx -e`** — they don't resolve. Persist the helper as a `.ts` file under `scripts/`. Use a 40-key batch (the existing helper caps at 20). Use `/rest/api/3/search/jql`, **not** the existing `searchIssuesWithDescriptions`.
7. **CSV row count** — with embedded newlines in description/body, `wc -l` reports 2,000+ instead of 102. Count via `csv.DictReader`, not `wc`.
8. **`commitsInWindowUnmatched` ambiguity** — there are two definitions; pick the one in §4 of the instruction file (commits in window that did not link to any Sprint-34 done-list ticket).
9. **Unmatched-row schema** — emit `matchConfidence=none` and leave every commit-side column including `matchMethod` empty.
10. **No `--all` branches** — only `manifest.repos[i].primaryBranch`. The clones are correctly scoped.

---

## 13. Open questions for the team

These need decisions before merging the first PR:

1. **Storage backend** — pgvector vs sqlite-vec vs both? Affects migration story.
2. **Re-confirmation semantics** — when a reviewer confirms a candidate, do we (a) lock that evidence row forever, (b) bump its tier to `direct`, (c) leave it as-is until next re-run, (d) something else?
3. **Bulk actions** — should a Sprint manager be able to "approve all `strong` candidates in one click"? (Leans yes; many teams ask.)
4. **Per-tier notifications** — should an unconfirmed `direct` (CX-#### literal in commit subject) alert the assignee to confirm? Probably yes for `reviewable` and `low`; no for `direct`.
5. **Inference caching** — should we cache embeddings across re-runs (not re-encode when the model hash matches)? Saves seconds. Free win.
6. **Cross-org benchmarking** — should AIDOS compute aggregates across all orgs? (e.g., "median commit-evidence coverage across all Connexus orgs"). Privacy controls needed.
7. **Multi-org vector separation** — same model, but every query is constrained to the org's `EvidenceLink` rows. Easy with `WHERE organizationId = $1`; just confirm the policy.
8. **Embedding translation for non-English ticket texts** — currently the model is English-only. Connexus uses English throughout, but other orgs might not. BGE-Multilingual variant exists.

---

## 14. Related artefacts in this repo

| File | Purpose |
|------|---------|
| One-off run CSV/JSON/JSONL output (moved out of the tree) | One-off run output (input for phase 0 → 1 migration) |
| Direct-key matcher script (moved out of the tree) | Direct-key matcher (phase 0) |
| Multi-signal matcher script (moved out of the tree) | Multi-signal matcher (phase 1) |
| Code-embedding matcher script (moved out of the tree) | Code-embedding matcher (phase 1 with vector sim) |
| One-off-run narrative (moved out of the tree) | Narrative of the one-off run; numbers in the executive summary |


| `src/lib/jira-api.ts` | Existing OAuth + search; the place to add `searchIssuesForEvidence` |
| `src/lib/jira-oauth.ts` | Existing refresh-token logic |
| `scripts/connexus-fetch-and-analyze-commits.sh` | Existing commit-window fetch — produces the manifest the evidence job consumes |
| `docs/jira-integration.md` | "Single source of truth" for Jira — extends with §3 evidence in a follow-up PR |
| `AGENTS.md` | Rule for where to register the EvidenceJob worker (`src/mastra/index.ts`) |

---

## 15. Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-07-08 | Initial RFC, draft for implementation | (one-off agent run) |

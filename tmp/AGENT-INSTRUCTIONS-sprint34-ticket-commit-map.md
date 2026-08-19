# Agent Task: Connexus Sprint 34 — Jira Ticket ↔ Commit Mapping

**Audience:** Cheaper / execution-focused agent  
**Goal:** Build a CSV linking each Sprint 34 **done** Jira ticket to matching Git commits on the `dev` branch within the analysis window.  
**Do not** refactor the AIDOS app. Use existing scripts, `curl`, `git`, and small helper scripts in `tmp/`.  
**Language:** prefer one Python pipeline for data munging (ADF, CSV, regex); auth helpers may be a small `.ts` file under `scripts/`. Glue language does not matter — Python is recommended.

> **Changelog (2026-07-08):** Updated from first-run findings. Auth uses a real `.ts` file (not `tsx -e`), defines `JIRA_API_BASE`, documents refresh-token failure → ask user, fixes ADF helper, clarifies CSV row counting, spot-checks, `commitsInWindowUnmatched` definition (B), unmatched-row fields, and secret redaction.

---

## 1. Objective

For every ticket in the Sprint 34 done list:

1. Fetch full Jira fields (summary, description, assignee, dates, etc.).
2. Scan commits on `dev` (already collected) for references to that ticket.
3. Emit one CSV row **per ticket–commit pair** (tickets with zero commits still get one row).

**Output file:**  
`/Users/musthafa/projects/AIDOS/tmp/connexus-sprint34-ticket-commit-map.csv`

---

## 2. Inputs (already prepared)

| File | Purpose |
|------|---------|
| `tmp/connexus-sprint34-done.csv` | 100 done Sprint 34 tickets (keys + basic fields) |
| `tmp/connexus-sprint34-commit-ids.json` | 3,129 commit SHAs on `dev`, grouped by repo |
| `tmp/connexus-sprint34-commit-ids.txt` | Same SHAs, **one SHA per line** (use this for allow-list checks) |
| `tmp/connexus-sprint34-repo-fetch-manifest.json` | Repo paths, `primaryBranch` per repo, per-repo commit files |

**Git clones (outside AIDOS):**  
`/tmp/connexus-repos-20260708-142754/git/{repo-name}/`

| Repo | Commits on `dev` |
|------|-----------------:|
| connexus-web-api | 1,675 |
| connexus-web-client | 1,448 |
| bulk-upload-service-api | 2 |
| file_conversion-service | 2 |
| connexus-perfomance | 2 |
| *(others)* | 0 |

**Analysis window** (from ticket CSV min/max dates):

```
since: 2026-01-09T00:00:00+05:30
until: 2026-07-02T23:59:59+05:30
primary branch: read from manifest.repos[i].primaryBranch (default `dev`)
  — NOT GitHub's default_branch (`prod` for most Connexus repos)
```

**Jira project key:** `CX`  
**Org slug:** `connexus`

---

## 3. Auth — read this entire block first

From repo root `/Users/musthafa/projects/AIDOS`.

### 3.1 GitHub token + primary branch

```bash
cd /Users/musthafa/projects/AIDOS
# Prefer writing eval output to a file (safer than multi-line $() on some shells):
bash scripts/connexus-github-env.sh > /tmp/connexus-gh-env.sh
source /tmp/connexus-gh-env.sh
# Sets: GITHUB_TOKEN, REPOS, PRIMARY_BRANCH (=dev)
```

### 3.2 Jira token — write a real `.ts` file (do NOT use `tsx -e`)

`tsx -e` does not reliably resolve `@/` path aliases and is easy to break with shell quoting. **Write this file once** if it does not exist:

**File:** `scripts/_get-jira-env-sprint34.ts`

```typescript
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveJiraAccessToken } from "../src/lib/jira-api";
import { parseJiraMeta } from "../src/lib/jira-meta";

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "connexus" } });
  if (!org) throw new Error("connexus org not found");

  const jira = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId: org.id, provider: "JIRA" },
    },
  });
  if (!jira) throw new Error("JIRA integration not found");

  const meta = parseJiraMeta(jira.metadataJson);
  const { accessToken, cloudId } = await resolveJiraAccessToken(jira);

  // Prove the token works before exporting
  const me = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!me.ok) {
    const body = await me.text();
    throw new Error(`Jira /myself failed ${me.status}: ${body.slice(0, 300)}`);
  }

  console.log(`export JIRA_TOKEN=${JSON.stringify(accessToken)}`);
  console.log(`export JIRA_CLOUD_ID=${JSON.stringify(cloudId)}`);
  console.log(`export JIRA_SITE_URL=${JSON.stringify(meta.siteUrl ?? "")}`);
  console.log(
    `export JIRA_API_BASE=${JSON.stringify(`https://api.atlassian.com/ex/jira/${cloudId}`)}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Then:

```bash
npx tsx scripts/_get-jira-env-sprint34.ts > /tmp/connexus-jira-env.sh
source /tmp/connexus-jira-env.sh
# Must now have: JIRA_TOKEN, JIRA_CLOUD_ID, JIRA_SITE_URL, JIRA_API_BASE
echo "$JIRA_API_BASE"   # expect: https://api.atlassian.com/ex/jira/<uuid>
```

**Cleanup:** delete `scripts/_get-jira-env-sprint34.ts` after the run if you created it only for this task (do not leave tokens in git). Prefer keeping secrets only in `/tmp/*-env.sh`.

### 3.3 Auth failure mode (mandatory)

If any of the following happen:

- `resolveJiraAccessToken` throws
- stored access token expired and refresh returns `403` / `unauthorized_client` / `refresh_token is invalid`
- `/rest/api/3/myself` returns **401**

**Stop. Do not invent a silent re-OAuth path.** Ask the user to reconnect Jira via the AIDOS UI (`/integrations` → Jira → Reconnect / authorize), then re-run section 3.2.

Do **not** attempt browser OAuth yourself unless the user explicitly asks.

---

## 4. Step A — Enrich Jira tickets (summary + description + dates)

### 4.1 Ticket keys

Read keys from `tmp/connexus-sprint34-done.csv` column `key` (100 rows).

### 4.2 Fetch descriptions in batches via curl (not the AIDOS helper)

**Do not** call `searchIssuesWithDescriptions` from the codebase — it hard-caps at **20** keys. Your script must batch at **40** via `POST /rest/api/3/search/jql`.

Use **`$JIRA_API_BASE`** (set in section 3). Complete example:

```bash
# Example for first batch — build the jql key list from the CSV in your script
curl -sS --retry 4 --retry-all-errors --retry-delay 2 -X POST \
  -H "Authorization: Bearer $JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  "$JIRA_API_BASE/rest/api/3/search/jql" \
  -d '{
    "jql": "key in (\"CX-2525\",\"CX-2734\",\"CX-2983\")",
    "maxResults": 40,
    "fields": [
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
      "customfield_10016"
    ]
  }'
```

**Retries:** on HTTP **429** or **5xx**, retry up to **4** times with exponential backoff (`2^attempt` seconds). Do not retry endlessly on **401/403** — treat as auth failure (section 3.3).

**Description field** is Atlassian Document Format (ADF). Convert to plain text, then:

1. Run **secret redaction** (section 14) on the plain text.
2. Truncate description to **2000 chars** in the CSV (`tickets-enriched.json` may keep full redacted text).

**Save intermediate file:**  
`tmp/connexus-sprint34-tickets-enriched.json`

Shape per ticket:

```json
{
  "key": "CX-3254",
  "summary": "...",
  "description": "plain text (secrets redacted)...",
  "assignee": "Varun Wilson",
  "assigneeAccountId": "...",
  "reporter": "Srilakshmi Sivan",
  "status": "Done",
  "issueType": "Bug",
  "priority": "Medium",
  "labels": ["MSATab"],
  "storyPoints": null,
  "created": "2026-04-30T13:37:14.643+0530",
  "updated": "2026-07-02T18:40:56.437+0530",
  "resolutionDate": "2026-07-02T18:40:56.419+0530",
  "browseUrl": "https://neoito-team-connexus.atlassian.net/browse/CX-3254"
}
```

### 4.3 ADF → text helper (Python) — tested recursive version

```python
def adf_to_text(node) -> str:
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(adf_to_text(n) for n in node)
    if not isinstance(node, dict):
        return str(node)

    t = node.get("type")
    if t == "text":
        return node.get("text") or ""
    if t == "hardBreak":
        return "\n"
    if t == "mention":
        return node.get("attrs", {}).get("text") or node.get("attrs", {}).get("id") or ""
    if t == "emoji":
        return node.get("attrs", {}).get("shortName") or ""
    if t == "inlineCard":
        return node.get("attrs", {}).get("url") or ""
    if t == "codeBlock":
        body = "".join(adf_to_text(c) for c in (node.get("content") or []))
        return f"\n{body}\n"

    # Generic: walk content list (NOT node.get("content") alone — that is a list)
    parts = [adf_to_text(c) for c in (node.get("content") or [])]
    text = "".join(parts)
    if t in ("paragraph", "heading", "listItem", "bulletList", "orderedList", "blockquote"):
        if text and not text.endswith("\n"):
            text += "\n"
    return text
```

---

## 5. Step B — Build commit index from git clones

For each repo in the manifest, read commits from the per-repo file **or** run `git log` on the clone.

### 5.1 Preferred: use existing commit list + enrich via git

Manifest field `commitsFile` points to e.g.  
`/tmp/connexus-repos-20260708-142754/connexus-web-api-commits.txt`

For each SHA in that file, inside `gitPath`:

```bash
cd /tmp/connexus-repos-20260708-142754/git/connexus-web-api
git show -s --format='%H|%an|%ae|%ad|%s' --date=iso-strict <sha>
# body:
git log -1 --format=%b <sha>
```

Fields needed per commit:

| Field | Source |
|-------|--------|
| `commitSha` | `%H` |
| `repo` | from manifest |
| `authorName` | `%an` |
| `authorEmail` | `%ae` |
| `commitDate` | `%ad` (ISO) |
| `subject` | `%s` (first line of message) |
| `body` | `git log -1 --format=%b` |
| `branch` | `manifest.repos[i].primaryBranch` (default `dev`) |

**Save intermediate file:**  
`tmp/connexus-sprint34-commits-enriched.jsonl`  
(one JSON object per line — keeps memory low for 3k+ commits)

Example line:

```json
{"sha":"001ae291...","repo":"Connexus-inc/connexus-web-api","authorName":"Rakhesh J","authorEmail":"...","commitDate":"2026-05-18T10:12:00+05:30","subject":"fix: cx-3352 - tooltip updated","body":"","branch":"dev"}
```

### 5.2 Performance tip

Process repos sequentially. For large repos (web-api, web-client), batch `git show` in chunks of 200 SHAs, or use `git cat-file --batch` for ~10× speedup. Skip repos with `commitCount: 0`. Prefer retry on transient git/IO errors (up to 3 times).

---

## 6. Step C — Match tickets to commits

### 6.1 Primary match rule (required)

Extract Jira keys from commit text using project key `CX`:

```regex
\bCX-(\d+)\b
```

(case-insensitive, word boundaries; hyphen required — Connexus almost always uses `CX-1234`, not `CX1234`)

Search in (in order):

1. Commit subject (`%s`)
2. Commit body (`%b`)
3. Merge commit branch refs if present in message (e.g. `Merge pull request #2087 from Connexus-inc/fix/cx-3321`)

Normalize to uppercase: `CX-1234`.

**This is the only automatic match rule you must implement.**  
A commit can match **multiple** tickets (rare). A ticket can match **multiple** commits.

### 6.2 Optional secondary signals (record in `matchMethod`, do not auto-link)

| Signal | How | Use |
|--------|-----|-----|
| Branch name | `CX-3254-fix-msa-filters` | `matchMethod=branch_name` only if key in branch |
| Assignee name | commit author vs ticket assignee | `matchMethod=assignee_hint` — **never** sole link |
| Date proximity | commit within `[created, resolutionDate]` | `matchMethod=date_window` — **never** sole link |

**Do not** link a commit to a ticket on assignee or date alone.

### 6.3 Match confidence + unmatched rows

| `matchConfidence` | Condition |
|-------------------|-----------|
| `high` | `CX-####` appears in commit subject |
| `medium` | `CX-####` appears only in commit body |
| `low` | key in branch name only |
| `none` | no commit found for ticket |

**Unmatched ticket rows:** emit `matchConfidence=none` and leave **every commit-side column empty**, including `matchMethod` (empty string / blank). Do not invent a sentinel for `matchMethod`.

---

## 7. Step D — Write output CSV

**Path:** `tmp/connexus-sprint34-ticket-commit-map.csv`

### 7.1 Row model

- **One row per (ticket, commit) pair** when matched.
- **One row per ticket** with empty commit columns when no match (`matchConfidence=none`).

### 7.2 Columns (exact order)

```csv
ticketKey,ticketSummary,ticketDescription,ticketAssignee,ticketReporter,ticketStatus,ticketIssueType,ticketPriority,ticketLabels,ticketStoryPoints,ticketCreated,ticketUpdated,ticketResolutionDate,ticketBrowseUrl,commitSha,commitRepo,commitBranch,commitDate,commitAuthorName,commitAuthorEmail,commitSubject,commitBodyExcerpt,matchMethod,matchConfidence,matchedJiraKeysInCommit
```

**Notes:**

- `ticketDescription`: plain text (secrets redacted), max 2000 chars, CSV-escaped.
- `commitBodyExcerpt`: first 500 chars of body, CSV-escaped.
- `matchedJiraKeysInCommit`: semicolon-separated list of all `CX-####` found in that commit (helps audit multi-ticket commits).
- `commitBranch`: `manifest.repos[i].primaryBranch` (usually `dev` for this run).
- Empty commit fields when no match.

### 7.3 CSV escaping

Wrap fields containing `,`, `"`, or newlines in double quotes; escape `"` as `""`.

**Counting rows:** descriptions contain end-of-line characters. **`wc -l` is wrong.** Count data rows with:

```bash
python3 -c "import csv; print(len(list(csv.DictReader(open('tmp/connexus-sprint34-ticket-commit-map.csv')))))"
```

Expect **≥ 100 data rows** (exactly one row per ticket minimum; more when a ticket matches multiple commits).

---

## 8. Suggested implementation script

Create **one** script the agent can run end-to-end:

`tmp/connexus-sprint34-map-tickets-to-commits.py`

High-level flow:

```text
1. Load ticket keys from connexus-sprint34-done.csv
2. Batch-fetch Jira details (40 keys / POST /rest/api/3/search/jql) → tickets-enriched.json
3. ADF → text → redact secrets
4. Load commit SHAs from connexus-sprint34-commit-ids.json
5. For each repo with commits: git show metadata → commits-enriched.jsonl
6. Build inverted index: ticketKey → [commits] via \bCX-(\d+)\b
7. Emit connexus-sprint34-ticket-commit-map.csv
8. Emit summary JSON: tmp/connexus-sprint34-ticket-commit-map-summary.json
```

Run:

```bash
cd /Users/musthafa/projects/AIDOS
source /tmp/connexus-gh-env.sh
source /tmp/connexus-jira-env.sh
python3 tmp/connexus-sprint34-map-tickets-to-commits.py
```

---

## 9. Summary file (required)

Write `tmp/connexus-sprint34-ticket-commit-map-summary.json`:

```json
{
  "ticketCount": 100,
  "ticketsWithAtLeastOneCommit": 0,
  "ticketsWithNoCommit": 0,
  "totalCommitRows": 0,
  "uniqueCommitsMatched": 0,
  "commitsInWindowUnmatched": 0,
  "matchConfidenceBreakdown": { "high": 0, "medium": 0, "low": 0, "none": 0 },
  "topTicketsByCommitCount": [{"key":"CX-....","commitCount":0}],
  "generatedAt": "ISO-8601"
}
```

### `commitsInWindowUnmatched` definition (required — pick B)

Use **definition (B)**:

> Count of commits in the analysis window that did **not** link to **any** ticket in the Sprint 34 **done list**.

So: `commitsInWindowUnmatched = (total unique commits in window) − (uniqueCommitsMatched)`.

Do **not** use definition (A) ("subject/body contains no `CX-####` at all"). Commits that mention a non–Sprint-34 key still count as unmatched for this task.

---

## 10. Verification checklist

Before marking done:

- [ ] CSV has **≥ 100 data rows** under `csv.DictReader` (not `wc -l`).
- [ ] Every `ticketKey` from `connexus-sprint34-done.csv` appears in output.
- [ ] No `commitSha` in output is outside `tmp/connexus-sprint34-commit-ids.txt` (one SHA per line).
- [ ] All matched commits are from repos/branches in manifest (`primaryBranch`, usually `dev`).
- [ ] Summary JSON written with `commitsInWindowUnmatched` using definition (B).
- [ ] Descriptions redacted for Bearer/JWT patterns (section 14); no live/example tokens left in CSV/JSON.
- [ ] Spot-checks below pass (matched + unmatched baselines).

### Spot-check A — matched (expected `matchConfidence=high|medium`)

These keys **do** appear in `dev` commit subject/body in the current clone set (verified on first run):

| Key | Notes |
|-----|-------|
| `CX-2525` | appears on `connexus-web-client` `dev` |
| `CX-3321` | merge / fix patterns |
| `CX-3352` | e.g. `fix: cx-3352 - tooltip updated` |

```bash
cd /tmp/connexus-repos-20260708-142754/git/connexus-web-client
git log dev --since='2026-01-09' --until='2026-07-03' --oneline | grep -iE 'CX-(2525|3321|3352)\b'
```

Expect ≥1 hit each; map CSV should show at least those tickets with non-empty `commitSha`.

### Spot-check B — unmatched baseline (expected `matchConfidence=none`)

These tickets are **on the done list** but their `CX-####` does **not** appear in any `dev` commit subject/body in the shallow clones (feature branch merges often drop the key). Treat as **baseline `none`**, not as a run failure:

| Key | Summary hint |
|-----|--------------|
| `CX-3254` | MSA date filters |
| `CX-3162` | TRELLO email templates |
| `CX-3146` | Vendor Compliance Sole Proprietor |

```bash
# Expect zero hits across repos with commits:
for r in connexus-web-api connexus-web-client bulk-upload-service-api file_conversion-service connexus-perfomance; do
  echo "== $r =="
  git -C /tmp/connexus-repos-20260708-142754/git/$r log dev --since='2026-01-09' --until='2026-07-03' --oneline \
    | grep -iE 'CX-(3254|3162|3146)\b' || true
done
```

---

## 11. Constraints & pitfalls

1. **Do not use `--all` branches** — use `manifest.repos[i].primaryBranch` (default `dev`).
2. **Do not clone inside AIDOS repo** — use `/tmp/connexus-repos-.../git/`.
3. **Do not use `searchIssuesWithDescriptions`** — it caps at 20; batch at 40 with curl.
4. **Many tickets have no commit reference** — Connexus often omits `CX-####` on merges to `dev`; `none` rows are expected (≈90/100 on first run).
5. **3,129 commits vs 100 tickets** — most commits will be unmatched; that's OK.
6. **Author name ≠ Jira assignee** — common due to git config; don't use as primary matcher.
7. **Timezone:** Jira dates use `+0530`; git `--date=iso-strict` may use offset — compare dates loosely for optional hints only.
8. **Auth rejected?** Ask user to reconnect Jira (section 3.3) — do not hammer refresh.
9. **Support tickets paste JWTs** into descriptions — always redact (section 14).

---

## 12. Reference: Connexus commit message patterns

Typical formats seen in this org:

```text
CX-3254 fix MSA date filters
[CX-3254] fix MSA date filters
fix/CX-3254-msa-filters
fix: cx-3352 - tooltip updated
Merged PR #123 (CX-3254)
Merge pull request #2087 from Connexus-inc/fix/cx-3321
```

Branch names often embed the key: `CX-3254-start-date-end-date-filters` — but **merge commits onto `dev` frequently drop the key**, so branch existence ≠ subject match.

---

## 13. Done definition

Task is complete when these files exist and pass the checklist:

1. `tmp/connexus-sprint34-tickets-enriched.json`
2. `tmp/connexus-sprint34-ticket-commit-map.csv`
3. `tmp/connexus-sprint34-ticket-commit-map-summary.json`

Optional intermediate: `tmp/connexus-sprint34-commits-enriched.jsonl`

**Do not** commit secrets or modify `.env`. Working outputs in `tmp/` are fine. Remove ephemeral `scripts/_get-jira-env-sprint34.ts` if you created it only for this task.

---

## 14. Secret redaction (required)

Connexus ticket descriptions sometimes paste vendor-invite / API example JWTs (`Authorization: Bearer …`, three-segment `eyJ…`). Faithfully dumping description into CSV/JSON would violate “no secrets.”

**Before writing** `tickets-enriched.json` or CSV description fields, redact:

```python
import re

JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
BEARER_RE = re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{12,}")

def redact_secrets(text: str) -> str:
    if not text:
        return text
    text = JWT_RE.sub("<redacted-jwt>", text)
    text = BEARER_RE.sub(r"\1<redacted-token>", text)
    return text
```

Apply to description text only (not to ticket keys/summaries). After redaction, a secret-scan of the CSV/`tickets-enriched.json` for `eyJ` JWTs and `Bearer eyJ` should find none.

---

## 15. Expected shape of a healthy first-run baseline (informational)

From the verified 2026-07-08 run (order of magnitude only — numbers may drift if commits/tickets change):

| Metric | Approx. |
|--------|--------:|
| Data rows in CSV | ~100–110 |
| Tickets with ≥1 commit | ~10 |
| Unique commits matched to done list | ~12 |
| `matchConfidence=none` tickets | ~90 |
| Unmatched baseline (`CX-3254`, `CX-3162`, `CX-3146`) | all `none` |

If you get **0** matches overall, something is wrong with the regex / commit enrichment — do not treat that as success.

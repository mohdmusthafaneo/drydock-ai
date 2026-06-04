# Code analysis — AI-assisted delivery intelligence

**Last updated:** 2026-06-04  
**Status:** P1 ✅ UI shell · P2a–P2b ✅ GitHub App auth + repo picker · P2c ✅ Analysis pipeline · P3 ✅ History & trends  
**Owner agents:** `/frontend` (page & components), `/backend` (GitHub App auth, sync, scoring engine), `/architect` (review before merge)

**Related docs:** [`docs/AIDOS-USP.md`](docs/AIDOS-USP.md) · [`docs/jira-integration.md`](docs/jira-integration.md) · [`feature-flag.md`](feature-flag.md)

> **This document is the spec for the Code Analysis page.** It defines UX, metrics, data contracts, and phased delivery. Do not duplicate scope elsewhere — link here.

---

## 1. Purpose

Give engineering leaders **operational visibility into how much code delivery is AI-assisted** — without AIDOS becoming an AI coding tool.

AIDOS sits **above** GitHub and answers governance questions such as:

- What share of merged code was written fully or partly with AI coding tools?
- Is AI usage increasing week over week — and is review coverage keeping pace?
- Which repos or teams rely most on AI assistance?
- Are high-AI PRs getting adequate human review before merge?

This aligns with AIDOS positioning: **observe and govern AI-native delivery**, not generate code.

---

## 2. Product constraints (non-negotiable)

| Rule | Detail |
|------|--------|
| Read-only | Pull from GitHub; no commits, PR comments, or branch mutations |
| Human-governed | Metrics inform recommendations and policy alerts — no auto-blocking merges in MVP |
| Multi-tenant | All analysis scoped by `organizationId`; GitHub App **installation token** from org `Integration.metadataJson.installationId` |
| GitHub App only | **No OAuth.** Repo access via App installation token — same model as org-wide webhooks |
| Honest uncertainty | Show confidence bands and “unknown” buckets — heuristics are imperfect |
| Not a copilot | Page copy frames **governance & visibility**, not “use more AI” |
| Verify build | Run `npm run build` before marking any PR complete |

---

## 3. Route & navigation

| Item | Value |
|------|--------|
| **Path** | `/code-analysis` |
| **Workspace** | Enterprise only (same guard as `/qa`, `/observability`) |
| **Nav label** | Code analysis |
| **Icon** | `Code2` or `Sparkles` (Lucide) — prefer `Code2` for clarity |
| **Placement** | After **QA intelligence**, before **Observability** (delivery → quality → code → ops) |
| **Feature flag** | `nav.code_analysis` in `NAV_FEATURE_FLAGS` (default `false` until UI ships) |

### Empty / blocked states

| Condition | UI |
|-----------|-----|
| GitHub App not installed | CTA card → `/integrations` (“Install GitHub App to analyze delivery”) |
| App installed, no repos granted | Prompt to **Add repositories** on GitHub (manage installation link) |
| App installed, no analysis yet | “Run analysis” CTA + explain first run may take a minute |
| App credentials missing server-side | Admin banner: set `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` in `.env` |
| MVP workspace | Redirect to `/accelerator` (same pattern as enterprise-only pages) |

---

## 4. Page information architecture

Single scrollable page with **sticky filter bar** and **tabbed drill-downs**. Dense but scannable — primary story above the fold, detail on demand.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Code analysis                                    [Sync now] [Export] │
│  AI-assisted delivery visibility · org/repo scope · last synced 2m ago│
├─────────────────────────────────────────────────────────────────────────┤
│  [Repo ▾] [Branch ▾] [Range: 30d ▾] [Team ▾]              [Compare ▾] │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │ AI lines │ │ AI commits│ │ AI PRs   │ │ Review   │                  │
│  │   34%    │ │   41%    │ │   28%    │ │ coverage │                  │
│  │  ▲ 4pts  │ │  ▲ 2pts  │ │  ▼ 1pt   │ │   92%    │                  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Attribution breakdown (donut)  │  Trend over time (stacked area)      │
│  Human-only / Assisted / Full   │  Lines · Commits · PRs by week       │
├─────────────────────────────────────────────────────────────────────────┤
│  By repository (horizontal bars) │  By author (top 8, compact table)   │
├─────────────────────────────────────────────────────────────────────────┤
│  Tabs: [Pull requests] [Commits] [Files] [Tools] [Governance signals] │
│  … filterable table + row expand …                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design tokens

Follow existing platform patterns (`PageHeader`, `Card`, `Badge`, `Button`, design tokens from `.cursor/rules/frontend-scope.mdc`):

- Human-only: neutral (`text-secondary`, slate bar)
- AI-assisted: accent `#4F8CFF`
- Fully AI-generated: AI purple `#8B5CF6`
- Unknown / low confidence: muted + dashed border
- Warnings (governance): `text-warning`

---

## 5. Metrics catalog

### 5.1 Headline KPIs (always visible)

| Metric | Definition (product) | Why it matters |
|--------|----------------------|----------------|
| **AI-assisted lines %** | Share of added/changed lines attributed to AI-assisted or fully-AI commits in range | Primary “how much code is AI-touched” answer |
| **AI-assisted commits %** | Commits classified as assisted or fully AI | Shows adoption at commit granularity |
| **AI-assisted PRs %** | Merged PRs where ≥ threshold of changed lines/commits are AI-attributed | Release-level view for leads |
| **Review coverage on AI PRs** | % of high-AI PRs with ≥1 human review approval before merge | Governance — trust & oversight |

Each KPI shows: current value, delta vs prior period (same length), sparkline (optional v2).

### 5.2 Attribution breakdown

Three-way split (+ optional fourth bucket):

| Bucket | Label | Meaning |
|--------|-------|---------|
| `human_only` | Human only | No AI signals detected |
| `ai_assisted` | AI-assisted | Mixed human + AI signals (e.g. co-author trailer, partial tool markers) |
| `ai_generated` | Fully AI-generated | Strong signals: bulk add, tool footer, explicit attribution |
| `unknown` | Unknown | Insufficient diff/message data (shown only if > 5%) |

Display as donut or stacked bar with counts and percentages.

### 5.3 Trend charts

- **X-axis:** time buckets (day for 7d, week for 30d/90d)
- **Series:** stacked area or grouped bars for the three attribution buckets
- **Toggle:** Lines | Commits | PRs (same chart shell, swap dataset)
- **Annotation:** mark GitHub sync events or policy changes (future)

### 5.4 Dimensional breakdowns

| Dimension | Visualization | Interaction |
|-----------|---------------|-------------|
| Repository | Horizontal bar chart, top 10 by volume | Click → filter page to repo |
| Author | Compact table: author, commits, AI %, last active | Click → filter to author |
| File type | Small bar chart (`.ts`, `.tsx`, `.py`, …) | Optional v2 |
| Tool (when detected) | Chips + mini bars: Cursor, Copilot, ChatGPT, Unknown | From commit/PR markers |

### 5.5 Drill-down tables (tabs)

Shared table features: sort, search, pagination (client-side for mock UI; server-side later), row expand.

#### Pull requests tab

| Column | Notes |
|--------|-------|
| PR | `#123` + title link (external GitHub) |
| Repo | `owner/repo` |
| Author | GitHub login |
| Merged | date |
| Lines changed | +/− |
| AI attribution | badge: Human / Assisted / Generated + confidence % |
| Reviews | count + “gap” badge if high-AI & zero reviews |
| Tools | optional chips |

Expand row: summary bullets, file list with per-file AI %, link to diff.

#### Commits tab

| Column | Notes |
|--------|-------|
| SHA (short) | link to GitHub |
| Message | truncated |
| Author | |
| Date | |
| Lines | additions / deletions |
| Classification | badge |
| Signals | tooltip: matched heuristics (e.g. `Co-authored-by: github-copilot`) |

#### Files tab (aggregated)

| Column | Notes |
|--------|-------|
| Path | |
| Changes | count in range |
| AI lines % | |
| Top contributors | avatars or logins |

#### Tools tab

Detected tools ranked by attributed lines/commits. “Unknown” always listed if present.

#### Governance signals tab

Rule-based cards (no LLM required for MVP):

| Signal | Example threshold |
|--------|-------------------|
| High-AI PR merged without review | AI lines > 70% and approvals = 0 |
| AI spike | Org AI % up > 15 pts vs prior 30d |
| Repo outlier | Repo AI % > 2× org average |
| Large fully-AI commit | Single commit > 500 lines, `ai_generated` |

Each signal: severity badge, entity link, “View in Approvals” stub (future workflow).

---

## 6. Filters & controls

| Control | Options | Default |
|---------|---------|---------|
| **Repo scope** | Org-selected repos from `metadata.repoFullNames` (Integrations picker) | Saved selection, or all if none saved yet |
| **Branch** | default branch · all branches | default branch |
| **Time range** | 7d · 30d · 90d · custom (v2) | 30d |
| **Team** | placeholder “All authors” (v2: map from org members) | All |
| **Compare** | vs previous period · vs org baseline | Previous period |

**Actions:**

- **Sync now** / **Run analysis** — `POST /api/code-analysis/analyze` (P2c; disabled/stub until backend ships)
- **Export** — CSV via `/api/code-analysis/export` or client-side from snapshot (mock today)

Sticky filter bar on scroll (client component).

---

## 7. UI implementation plan (Phase 1 — ship first)

### 7.1 Goal

Fully interactive page with **realistic mock data** so stakeholders can review UX before backend work.

### 7.2 Files to add

| Area | Path |
|------|------|
| Page (server) | `src/app/(platform)/code-analysis/page.tsx` |
| Mock data | `src/lib/code-analysis/mock-data.ts` |
| Types (shared) | `src/lib/code-analysis/types.ts` |
| KPI strip | `src/components/code-analysis/kpi-strip.tsx` |
| Attribution chart | `src/components/code-analysis/attribution-chart.tsx` |
| Trend chart | `src/components/code-analysis/trend-chart.tsx` |
| Breakdown panels | `src/components/code-analysis/repo-breakdown.tsx`, `author-breakdown.tsx` |
| Filter bar | `src/components/code-analysis/analysis-filters.tsx` (client) |
| Drill-down tabs | `src/components/code-analysis/analysis-tabs.tsx` (client) |
| Empty states | `src/components/code-analysis/connect-github-empty.tsx` |
| Governance signals | `src/components/code-analysis/governance-signals.tsx` |

### 7.3 Page behavior (UI-only)

1. Server: session + org context; check GitHub integration has `installationId` (App installed).
2. If GitHub App not installed → empty state (no mock charts).
3. If App installed but no snapshot yet → render mock snapshot **with banner** “Run analysis for live data” (until P2 UI wired).
4. If snapshot exists in `Integration.metadataJson.codeAnalysisSnapshot` → render live data via `/api/code-analysis/snapshot`.
5. Client filters update displayed data locally (mock) or re-fetch snapshot (live).

### 7.4 Nav & flags

| File | Change |
|------|--------|
| `src/lib/feature-flags.ts` | Add `nav.code_analysis`, map `/code-analysis` |
| `src/lib/workspace-mode.ts` | Add nav item; add `/code-analysis` to enterprise-only paths |
| `feature-flag.md` | Document new flag |

Enable flag when page is ready for demo.

### 7.5 Acceptance criteria (UI phase)

- [x] Page loads at `/code-analysis` for Enterprise workspace with DNA configured
- [x] Four KPI cards + attribution + trend + repo/author breakdown visible with mock data
- [x] Tabs switch without full page reload; tables sortable
- [x] Filters narrow mock dataset (repo, range label updates)
- [x] GitHub App not installed state shows integration CTA
- [x] Mobile: KPIs 2×2 grid; tabs scroll horizontally; bottom nav not obscured (`pb-24`)
- [x] `npm run build` passes

---

## 8. GitHub App authentication (required for P2)

AIDOS uses **GitHub Apps only** for repository access. OAuth routes (`/api/integrations/github/authorize`, `/callback`) are legacy and must **not** be used for code analysis or sync.

### 8.0 Current implementation audit (2026-06-03)

| Component | Path | Status |
|-----------|------|--------|
| App install redirect + persist `installationId` | `src/lib/github-app-install.ts`, `src/app/(platform)/integrations/page.tsx`, `src/app/api/integrations/github/app-callback/route.ts` | ✅ Done |
| Integrations UI (install / manage / add repos) | `src/components/integrations/github-integration-panel.tsx` | ✅ Done (still mentions OAuth for sync — needs cleanup) |
| App JWT mint + installation access token | `src/lib/github-app-auth.ts` | ✅ Done |
| Token resolver (App-only, no OAuth fallback) | `src/lib/github-token.ts` | ✅ Done |
| List installation repos + org repo picker | `src/lib/github-api.ts`, `src/lib/github-repo-selection.ts`, `/api/integrations/github/repos` | ✅ Done |
| GitHub metadata sync via App token | `src/lib/github-sync.ts` | ✅ Done (uses `repoFullNames`) |
| Code analysis ingest + classifier | `src/lib/code-analysis/sync.ts`, `classifier.ts`, … | ✅ Done |
| Code analysis API routes | `src/app/api/code-analysis/{analyze,snapshot,export}/route.ts` | ✅ Done |
| Dashboard wired to live snapshot | `src/components/code-analysis/code-analysis-dashboard.tsx` | ✅ Live + mock fallback |

### 8.1 End-to-end flow (target)

```
Admin installs AIDOS GitHub App on GitHub
        │
        ▼
GitHub redirects → /integrations?installation_id=…&setup_action=install
        │
        ▼
persistGitHubAppInstallation() → Integration.metadataJson.installationId
        │
        ▼
User clicks "Run analysis" on /code-analysis (or "Sync" on /integrations)
        │
        ▼
Server: mintAppJWT()  ──using──►  GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY
        │
        ▼
POST /app/installations/{installationId}/access_tokens  →  installation token (~1 hr)
        │
        ▼
GET /installation/repositories  →  repos granted to this installation
        │     (filter: org metadata.repoFullNames — same as Jira projectKeys)
        ▼
Per repo: commits, commit detail, closed/merged PRs, PR files, reviews
        │
        ▼
classifyCommit / classifyPullRequest  →  computeSnapshot  →  persist codeAnalysisSnapshot
        │
        ▼
GET /api/code-analysis/snapshot  →  dashboard renders live KPIs
```

**Session requirement:** The admin completing the install must be logged into AIDOS so `installationId` binds to the correct `organizationId`. If the App is already installed on GitHub but AIDOS has no row, re-open the install URL while logged in.

### 8.2 Server credentials (`.env`)

| Variable | Source | Required for |
|----------|--------|--------------|
| `GITHUB_APP_SLUG` | App public page slug (e.g. `aidos-neo`) | Install / manage URLs in UI |
| `GITHUB_APP_ID` | GitHub App settings → App ID | JWT `iss` claim |
| `GITHUB_APP_PRIVATE_KEY` | Generate/download PEM; paste with `\n` escaped | Sign App JWT (RS256) |
| `GITHUB_WEBHOOK_SECRET` | App settings → Webhook secret | Webhook signature verify (optional for analysis MVP) |
| `NEXT_PUBLIC_APP_URL` | App base URL | Install callback |

Per-org repo scope is stored in `Integration.metadataJson.repoFullNames` (set via Integrations UI) — **not** platform env. Same pattern as Jira `projectKeys`.

Add to `.env.example` when implementing P2:

```bash
GITHUB_APP_ID="123456"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

**GitHub App permissions** (minimum for code analysis):

| Permission | Access | APIs used |
|------------|--------|-----------|
| Metadata | Read | Repo discovery |
| Contents | Read | Commit diffs, file lists |
| Pull requests | Read | Merged PRs, files, reviews |
| Actions | Read | Workflow runs (sync telemetry, optional) |

Subscribe to webhooks: `push`, `pull_request`, `workflow_run` (incremental sync — future).

### 8.3 New / updated backend files (P2)

| File | Purpose |
|------|---------|
| `src/lib/github-app-auth.ts` | `mintAppJWT()`, `getInstallationToken(installationId)` with ~55 min cache |
| `src/lib/github-token.ts` | `resolveGitHubTokenForIntegration(integration)` — **App only**; clear error if `installationId` or creds missing |
| `src/lib/github-api.ts` | Add `listInstallationRepos`, `listCommits`, `getCommit`, `listClosedPulls`, `getPullRequestFiles`, `listPullRequestReviews` |
| `src/lib/github-sync.ts` | Replace OAuth token path with `resolveGitHubTokenForIntegration`; use `listInstallationRepos` instead of `listUserRepos` |
| `src/lib/github-repo-selection.ts` | `fetchOrgGitHubRepos`, `saveOrgGitHubRepoFullNames`, `resolveSyncRepoFullNames` |
| `src/app/api/integrations/github/repos/route.ts` | GET list + PUT save org repo selection |
| `src/lib/integration-meta.ts` | Add `repoFullNames?: string[]` to `GitHubIntegrationMeta` |
| `src/lib/code-analysis/classifier.ts` | Heuristic commit/PR classification |
| `src/lib/code-analysis/compute-snapshot.ts` | Roll up KPIs, trends, governance signals |
| `src/lib/code-analysis/sync.ts` | Orchestrate fetch → classify → persist |
| `src/app/api/code-analysis/analyze/route.ts` | POST — trigger `syncCodeAnalysis` |
| `src/app/api/code-analysis/snapshot/route.ts` | GET — filtered snapshot (fallback mock if none) |
| `src/app/api/code-analysis/export/route.ts` | GET — CSV export |

Refactor `src/components/integrations/github-integration-panel.tsx`:

- Remove “manual sync requires OAuth” copy; enable **Sync repositories** when `installationId` is present.
- Remove OAuth badge / dual-mode display; show **GitHub App** only.
- Deprecate `GitHubOAuthConnect` from integrations UX (keep routes for backward compat until removal ticket).

### 8.4 Credentials & data the implementer may need

Before starting P2 backend work, confirm:

1. **`GITHUB_APP_ID` + private key PEM** — from the GitHub App settings page (or share securely for local `.env`).
2. **Installation id for your org** — visible on `/integrations` after install (`#12345678`), or query `Integration.metadataJson` for `provider = 'GITHUB'`.
3. **Test repos** — pick from installation repos in Integrations UI (NeoITO install #136129458 has 4 repos as of 2026-06-03).
4. **Dev Postgres** (optional) — to verify `installationId` is persisted for your test org if install UI was used on another environment.

Do **not** commit private keys or tokens. Use `.env` locally; production via secrets manager.

---

## 9. Data & calculation plan (Phase 2+)

### 9.1 GitHub inputs (App installation token)

Extend `src/lib/github-api.ts`. All calls use the **installation access token** (not user OAuth, not App JWT directly).

| Source | API | Use |
|--------|-----|-----|
| Installation repos | `GET /installation/repositories` | Scope — repos the App was granted |
| Single repo | `GET /repos/{owner}/{repo}` | Allowlist repos not in first page |
| Commits | `GET /repos/{owner}/{repo}/commits` | Classification, trends |
| Commit detail | `GET /repos/{owner}/{repo}/commits/{sha}` | Line stats, files |
| Pulls | `GET /repos/{owner}/{repo}/pulls?state=closed` | Merged PRs |
| PR files | `GET /repos/{owner}/{repo}/pulls/{n}/files` | Line attribution |
| Reviews | `GET /repos/{owner}/{repo}/pulls/{n}/reviews` | Governance metrics |
| Compare | `GET /repos/{owner}/{repo}/compare/{base}...{head}` | PR diff stats (optional v2) |

Optional later:

- GitHub Copilot usage metrics (Enterprise Cloud) — org-level, not per-commit
- Webhooks (`pull_request`, `push`) for incremental updates via `src/lib/github-webhook.ts`

### 9.2 Classification model (heuristic v1)

No ML in v1 — transparent rules with confidence score 0–100.

```
signals = []
if commit.message matches COPILOT_COAUTHOR: signals += copilot
if commit.message matches "Generated with" / tool footers: signals += tool_footer
if single-commit additions > 300 and few deletions: signals += bulk_add
if PR body contains cursor/copilot keywords: signals += pr_marker
…

score_ai = weighted sum
if score_ai >= HIGH: classification = ai_generated
elif score_ai >= LOW: classification = ai_assisted
else: classification = human_only
confidence = f(signal_count, diff_quality)
```

Document matched signals in UI (commit expand row) for auditability — core AIDOS trust principle.

### 9.3 Persistence (P3 — implemented)

| Model | Purpose |
|-------|---------|
| `CodeAnalysisRun` | Audit trail per analyze (repo scope, counts, summary) |
| `CodeAnalysisCommit` | Upserted commit rows (90d window for trends/drill-down) |
| `CodeAnalysisPullRequest` | Upserted merged PR rows |

`resolveStoredCodeAnalysis()` reads **DB first**, then falls back to `Integration.metadataJson.codeAnalysisSnapshot`. Each **Sync now** run upserts rows and still updates metadata for backward compatibility.

**Migration:** `prisma/migrations/20260604120000_code_analysis_history` — run `npx prisma migrate deploy` in each environment.

**Automated sync:** Not shipped in-repo. Use **Sync now** on `/code-analysis` (or `POST /api/code-analysis/analyze` with a user session). An external scheduler (Coolify cron, etc.) can be wired later if needed.

### 9.4 API routes (Phase 2)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/code-analysis/analyze` | POST | Trigger analysis job for org (uses App installation token) |
| `/api/code-analysis/snapshot` | GET | Latest rollup + query params (range, repo) |
| `/api/code-analysis/export` | GET | CSV export |

All routes: session required, `organizationId` from session, Zod validation, audit log on analyze.

> **Note:** `/api/integrations/github/analyze` (single PR/commit deep analysis + Check Runs) is a **separate** feature slice — not the code-analysis dashboard rollup. Do not conflate the two routes.

### 9.5 Sync integration

Hook analysis after successful GitHub sync (or dedicated **Run analysis** button on this page):

```
GitHub App install persisted
  → resolveGitHubTokenForIntegration(integration)
  → listInstallationRepos
  → fetch commits/PRs in window → classify → persist codeAnalysisSnapshot → ActivityEvent + AuditLog
```

Rate limits: paginate commits, cap repos per run (reuse `MAX_REPOS_DETAIL` pattern), backoff on 403.

### 9.6 P2 acceptance criteria (GitHub App ingest)

- [ ] `.env` has `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`
- [ ] Org with App installed: `installationId` in `Integration.metadataJson`
- [ ] `POST /api/code-analysis/analyze` returns snapshot; no OAuth token required
- [ ] Repos analyzed ⊆ org `repoFullNames` ∩ installation-granted repos
- [ ] Dashboard loads live data from `/api/code-analysis/snapshot` after analyze
- [ ] Integrations **Sync repositories** works with App-only connection
- [ ] Org A cannot read org B snapshots
- [ ] Audit log entry on each analysis run
- [ ] `npm run build` passes

---

## 10. Phased delivery

| Phase | Scope | Status |
|-------|--------|--------|
| **P1 — UI shell** | Page, components, mock data, nav flag, empty states | ✅ Done |
| **P2a — GitHub App auth** | JWT mint, installation token, token resolver, env docs | ✅ Done |
| **P2b — GitHub ingest** | `listInstallationRepos`, org repo picker, refactor `github-sync` | ✅ Done |
| **P2c — Analysis pipeline** | Classifier, `syncCodeAnalysis`, snapshot API, wire dashboard | ✅ Done |
| **P3 — History & trends** | Prisma models, DB-backed history, real trend charts (UI **Sync now** only) | ✅ Done |
| **P3b — Automated sync** | External scheduler → batch analyze (optional; not GitHub Actions) | Not started |
| **P4 — Governance** | Policy thresholds in Delivery DNA, signals → recommendations | Not started |
| **P5 — Tool telemetry** | Optional IDE plugin / commit trailer convention for higher confidence | Future |

**Recommended build order for `/backend`:** P2a → P2b → P2c (each PR verifiable with your installed App + dev repos).

---

## 11. Copy & governance framing (UI strings)

Use language that matches [`docs/AIDOS-USP.md`](docs/AIDOS-USP.md):

| Avoid | Prefer |
|-------|--------|
| “Boost AI productivity” | “Visibility into AI-assisted delivery” |
| “Copilot dashboard” | “Code analysis · governance view” |
| “Autonomous coding” | “Human-reviewed AI contribution” |

Page subtitle (draft):

> *Measure how much of your merged code, commits, and pull requests are human-only, AI-assisted, or fully AI-generated — so leaders can govern AI-native delivery with evidence.*

Tooltip on AI %:

> *Estimated from commit messages, co-author trailers, and change patterns. Not all tools leave markers — see confidence on each row.*

---

## 12. Verification

### UI phase

1. `npm run build`
2. Enterprise org with DNA → enable `nav.code_analysis` → visit `/code-analysis`
3. Confirm mock KPIs, charts, tab tables, filters
4. Disconnect GitHub (or use org without integration) → CTA state
5. Resize to mobile → layout intact

### Backend phase (P2)

1. Set App credentials in `.env`; confirm App permissions (Contents, Pull requests, Metadata read)
2. Install App on GitHub while logged into AIDOS → verify `installationId` on `/integrations`
3. Select 1–2 repos in Integrations → Save selection → Sync repositories
4. `POST /api/code-analysis/analyze` → expect `ok: true` and non-empty snapshot
5. Visit `/code-analysis` → live KPIs (not mock banner)
6. Compare sample PR classifications manually against GitHub UI
7. Confirm org A cannot read org B snapshots
8. Audit log entry on each analysis run

---

## 13. Open questions

| # | Question | Default assumption |
|---|----------|-------------------|
| 1 | Default repo scope | **Org `repoFullNames`** from Integrations picker (required before sync); max 10 repos |
| 6 | OAuth removal timeline? | Deprecate OAuth connect UI now; remove routes in follow-up after App sync proven |
| 2 | Count lines: additions only or additions + deletions? | **Additions only** for AI % numerator/denominator |
| 3 | Include unmerged PRs? | **Merged only** for PR KPI; open PRs in separate filter (v2) |
| 4 | New dependency for charts? | CSS/SVG first; add chart lib only if needed in P3 |
| 5 | Link to Reports page? | Cross-link from `/reports` card; keep dedicated page as primary |
| 7 | Automated analyze cadence? | **Manual Sync now** for MVP; external cron (Coolify, etc.) in P3b — no in-repo GitHub Actions |

---

## 14. Mock data shape (for P1 UI / snapshot fallback)

```ts
// src/lib/code-analysis/types.ts (illustrative)

export type AiAttribution = "human_only" | "ai_assisted" | "ai_generated" | "unknown";

export type CodeAnalysisSnapshot = {
  generatedAt: string;
  rangeLabel: string;
  repos: string[];
  kpis: {
    aiLinesPct: number;
    aiLinesPctDelta: number;
    aiCommitsPct: number;
    aiCommitsPctDelta: number;
    aiPrsPct: number;
    aiPrsPctDelta: number;
    reviewCoverageOnAiPrsPct: number;
  };
  attribution: Record<AiAttribution, { count: number; lines: number }>;
  trend: { bucket: string; human_only: number; ai_assisted: number; ai_generated: number }[];
  byRepo: { repo: string; aiLinesPct: number; totalLines: number }[];
  byAuthor: { login: string; aiLinesPct: number; commits: number }[];
  pullRequests: /* … */;
  commits: /* … */;
  governanceSignals: /* … */;
};
```

---

*Next step: `/backend` implements **P2a → P2c** per §8–§9 using your installed GitHub App. Share `GITHUB_APP_ID`, private key PEM, and test repo names when ready to run against live data.*

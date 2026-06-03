# Code analysis — AI-assisted delivery intelligence

**Last updated:** 2026-06-03  
**Status:** P1 ✅ UI shell · P2+ (GitHub ingest) not started  
**Owner agents:** `/frontend` (page & components), `/backend` (GitHub sync, scoring engine), `/architect` (review before merge)

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
| Multi-tenant | All analysis scoped by `organizationId`; tokens from org `Integration` (GITHUB) |
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
| GitHub not connected | CTA card → `/integrations` (“Connect GitHub to analyze delivery”) |
| Connected, no repos selected | Prompt to configure repo scope (reuse allowlist pattern from GitHub sync) |
| Connected, no data yet | “Run analysis” or “Sync GitHub” CTA + explain first sync may take a minute |
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
| **Repo scope** | All connected repos · multi-select from GitHub meta | All (or allowlist from `GITHUB_SYNC_REPOS`) |
| **Branch** | default branch · all branches | default branch |
| **Time range** | 7d · 30d · 90d · custom (v2) | 30d |
| **Team** | placeholder “All authors” (v2: map from org members) | All |
| **Compare** | vs previous period · vs org baseline | Previous period |

**Actions:**

- **Sync now** — triggers GitHub sync + analysis refresh (disabled in UI-only phase; show toast “Coming soon” or no-op)
- **Export** — CSV of current table (mock: download static sample CSV in UI phase)

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

1. Server: session + org context; check GitHub integration status from `getOrganizationContext` / integration list.
2. If GitHub disconnected → empty state (no mock charts).
3. If connected → render mock snapshot from `getMockCodeAnalysisSnapshot()` with hard-coded realistic numbers.
4. Client filters update displayed mock data locally (filter repos/authors in memory).
5. Charts: CSS/SVG first (match `MetricBars` simplicity); optional `recharts` only if already in deps — **prefer zero new deps** for Phase 1.

### 7.4 Nav & flags

| File | Change |
|------|--------|
| `src/lib/feature-flags.ts` | Add `nav.code_analysis`, map `/code-analysis` |
| `src/lib/workspace-mode.ts` | Add nav item; add `/code-analysis` to enterprise-only paths |
| `feature-flag.md` | Document new flag |

Enable flag when page is ready for demo.

### 7.5 Acceptance criteria (UI phase)

- [ ] Page loads at `/code-analysis` for Enterprise workspace with DNA configured
- [ ] Four KPI cards + attribution + trend + repo/author breakdown visible with mock data
- [ ] Tabs switch without full page reload; tables sortable
- [ ] Filters narrow mock dataset (repo, range label updates)
- [ ] GitHub disconnected state shows integration CTA
- [ ] Mobile: KPIs 2×2 grid; tabs scroll horizontally; bottom nav not obscured (`pb-24`)
- [ ] `npm run build` passes

---

## 8. Data & calculation plan (Phase 2+)

### 8.1 GitHub inputs

Extend existing GitHub client (`src/lib/github-api.ts`) and sync (`src/lib/github-sync.ts`):

| Source | API (indicative) | Use |
|--------|------------------|-----|
| Repos | `GET /user/repos`, allowlist | Scope |
| Commits | `GET /repos/{owner}/{repo}/commits` | Classification, trends |
| Commit detail | `GET /repos/{owner}/{repo}/commits/{sha}` | Line stats, files |
| Pulls | `GET /repos/{owner}/{repo}/pulls?state=closed` | Merged PRs |
| PR files | `GET /repos/{owner}/{repo}/pulls/{n}/files` | Line attribution |
| Reviews | `GET /repos/{owner}/{repo}/pulls/{n}/reviews` | Governance metrics |
| Compare | `GET /repos/{owner}/{repo}/compare/{base}...{head}` | PR diff stats |

Optional later:

- GitHub Copilot usage metrics (Enterprise Cloud) — org-level, not per-commit
- Webhooks (`pull_request`, `push`) for incremental updates via `src/lib/github-webhook.ts`

### 8.2 Classification model (heuristic v1)

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

### 8.3 Persistence (recommended schema sketch)

Store snapshots per org sync — avoid re-fetching full history on every page load.

| Model | Purpose |
|-------|---------|
| `CodeAnalysisSnapshot` | Org-level rollup for a time window (JSON metrics blob) |
| `CodeAnalysisCommit` | Optional normalized rows for drill-down |
| `CodeAnalysisPullRequest` | PR-level attribution + review metadata |

Alternative for MVP backend: extend `Integration.metadataJson` with `codeAnalysisSummary` (like Jira `deliverySnapshot`) — faster to ship, weaker history. Prefer dedicated tables before trends/governance alerts.

### 8.4 API routes (Phase 2)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/integrations/github/analyze` | POST | Trigger analysis job for org |
| `/api/code-analysis/snapshot` | GET | Latest rollup + query params (range, repo) |
| `/api/code-analysis/export` | GET | CSV export |

All routes: session required, `organizationId` from session, Zod validation, audit log on analyze.

### 8.5 Sync integration

Hook analysis after successful GitHub sync (or separate button on this page):

```
GitHub sync (existing) → fetch commits/PRs in window → classify → persist snapshot → ActivityEvent + AuditLog
```

Rate limits: paginate commits, cap repos per run (reuse `MAX_REPOS_DETAIL` pattern), backoff on 403.

---

## 9. Phased delivery

| Phase | Scope | Status |
|-------|--------|--------|
| **P1 — UI shell** | Page, components, mock data, nav flag, empty states | ✅ Done |
| **P2 — GitHub ingest** | API extensions, heuristic classifier, snapshot in metadata | Not started |
| **P3 — History & trends** | Prisma models, scheduled sync, real trend charts | Not started |
| **P4 — Governance** | Policy thresholds in Delivery DNA, signals → recommendations | Not started |
| **P5 — Tool telemetry** | Optional IDE plugin / commit trailer convention for higher confidence | Future |

---

## 10. Copy & governance framing (UI strings)

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

## 11. Verification

### UI phase

1. `npm run build`
2. Enterprise org with DNA → enable `nav.code_analysis` → visit `/code-analysis`
3. Confirm mock KPIs, charts, tab tables, filters
4. Disconnect GitHub (or use org without integration) → CTA state
5. Resize to mobile → layout intact

### Backend phase (later)

1. Connect GitHub, select repos, POST analyze
2. Compare sample PR classifications manually against GitHub UI
3. Confirm org A cannot read org B snapshots
4. Audit log entry on each analysis run

---

## 12. Open questions

| # | Question | Default assumption |
|---|----------|-------------------|
| 1 | Default repo scope: all repos vs env allowlist only? | Same as sync: allowlist if set, else top N recent |
| 2 | Count lines: additions only or additions + deletions? | **Additions only** for AI % numerator/denominator |
| 3 | Include unmerged PRs? | **Merged only** for PR KPI; open PRs in separate filter (v2) |
| 4 | New dependency for charts? | CSS/SVG first; add chart lib only if needed in P3 |
| 5 | Link to Reports page? | Cross-link from `/reports` card; keep dedicated page as primary |

---

## 13. Mock data shape (for P1 UI)

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

*Next step: implement **P1 UI shell** per §7; open a follow-up task for `/backend` on §8 when UX is approved.*

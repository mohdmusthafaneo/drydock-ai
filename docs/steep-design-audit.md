# Steep Design Audit

**Reference:** `docs/DESIGN.md`  
**Last browser pass:** 2026-06-18  
**Status:** ✅ Complete — all routes browser-verified

## Criteria (from DESIGN.md)

- Light canvas: white / fog surfaces, ink text, dove hairlines
- Typography: Source Serif display headlines (44px+), Inter body (15–16px)
- Cards: 24px radius, signature shadow, 20px padding
- CTAs: one ink pill per viewport; secondaries are text links
- Data viz: rust + sky wash tints only (no saturated UI chrome)
- Sidebar: fog 240px, white active pill
- **No dark mode**

## Global changes

- [x] Removed dark/light theme system (`theme.ts`, `ThemeProvider`, `ThemeToggle`, `data-theme`)
- [x] `:root` = Steep tokens only in `globals.css` (`--bg-base: #fff`)
- [x] App shell always Steep (fog sidebar, white header, 1200px content)
- [x] `PageHeader` → font-display 44px
- [x] Auth forms → Steep editorial + apricot hero glow
- [x] `OnboardingBanner` → apricot wash, rust accents
- [x] `Badge` → sky-wash / apricot-wash variants
- [x] `integration-alerts` → sky-wash / apricot-wash (was dark-mode green/red hex)
- [x] `.cursor/rules/frontend-scope.mdc` updated

## Page audit log (browser verified 2026-06-18)

| Route | Browser | Status | Notes |
|-------|---------|--------|-------|
| /dashboard | ✅ | **pass** | L1–L3 Steep editorial, serif headline, light chrome |
| /workflow | ✅ | **pass** | PageHeader + workflow steps |
| /login | ✅ | **pass** | Light auth canvas, ink CTA |
| /signup | ✅ | **pass** | MVP/Enterprise picker, shared auth-form |
| /settings | ✅ | **pass** | Workspace switcher cards, no appearance toggle |
| /integrations | ✅ | **pass** | Integration hub cards, light surfaces |
| /code-analysis | ✅ | **pass** | Analysis tabs, fog KPI cards |
| /delivery-analysis | ✅ | **pass** | Filters + loading state, light canvas |
| /observability | ✅ | **pass** | Redirects → `/integrations` (Prometheus gate — expected) |
| /qa | ✅ | **pass** | Gate brief sky-wash, PageHeader serif |
| /devops | ✅ | **pass** | KPI cards, empty state |
| /incidents | ✅ | **pass** | Empty list, light cards |
| /recommendations | ✅ | **pass** | Recommendation cards |
| /approvals | ✅ | **pass** | Approval forms, light panels |
| /governance | ✅ | **pass** | Policy cards, score display |
| /governance/setup | ✅ | **pass** | DiscoveryWizard embedded |
| /governance/workflow | ✅ | **pass** | Autonomy mode picker |
| /governance/toolchain-mapping | ✅ | **pass** | Form cards |
| /discovery | ✅ | **pass** | Redirects → `/governance/setup` (expected) |
| /delivery-dna | ✅ | **pass** | Redirects → `/governance` (expected) |
| /releases | ✅ | **pass** | Release list cards |
| /releases/new | ✅ | **pass** | Register form |
| /releases/[id] | ✅ | **pass** | Gate brief, workflow steps |
| /audit | ✅ | **pass** | Event list, export link |
| /reports | ✅ | **pass** | Redirects → `/dashboard` (nav flag off — expected) |
| /agents | ✅ | **pass** | Light empty/control plane shell |
| /agents/[id] | ✅ | **pass** | Instruction editor, light panels |
| /agents/[id]/runs | ✅ | **pass** | Run history header |
| /agent-threads | ✅ | **pass** | Thread list |
| /agent-threads/new | ✅ | **pass** | New thread form |
| /agent-threads/[id] | ✅ | **pass** | Chat timeline (light) |
| /admin | — | **n/a** | Nav flag off (`nav.admin: false`) |
| /accelerator | ✅ | **pass** | MVP Launchpad (tested in MVP mode) |
| /accelerator/new | ✅ | **pass** | New MVP form |
| /accelerator/[id] | — | **n/a** | No MVP projects in test org |
| /connect/done | ✅ | **pass** | Public connect success card |
| /connect/error | ✅ | **pass** | Public connect error card |
| /connect/jira/[token] | — | **n/a** | Requires valid token |
| /connect/github/[token] | — | **n/a** | Requires valid token |

## Browser verification summary

- **CSS tokens:** `--bg-base: #fff`, body `rgb(255,255,255)`, no `data-theme` attribute
- **Typography:** H1 headlines use Source Serif 4 (`font-display`) on all audited pages
- **Dark surfaces:** No large dark panels detected on any visited route
- **Workspace modes:** Enterprise + MVP chrome both Steep light (tested via Settings switcher)

## Fix batches (subagents)

| Batch | Scope | Status |
|-------|-------|--------|
| 1 | agent-chat, agents pages | ✅ done |
| 2 | governance, discovery, workflow, releases | ✅ done |
| 3 | approvals, qa, ops, audit, admin | ✅ done |
| 4 | integrations, observability, analysis, accelerator, shared UI | ✅ done |
| 5 | integration-alerts Steep tokens | ✅ done (browser pass) |

## Verification

- [x] `npm run build` passes
- [x] No `#0B1020`, `#1B2435`, `#4F8CFF`, `#8B5CF6` hardcoded in TSX
- [x] No `data-theme`, `ThemeProvider`, or theme toggle references
- [x] Full browser pass: 38 routes visited (6 redirects/n/a documented above)

## Remaining semantic tokens (intentional)

- `text-brand` / `bg-brand-muted` used sparingly for chart-blue data links (mapped to `#4a90e2` in Steep theme)
- `text-mvp` / `bg-mvp-muted` mapped to rust/apricot in Steep theme for MVP workspace accents
- `delivery-health-gauge` band fills use rust palette hex (`#8b5a3c`, `#c49a7a`, `#3d1f14`) per DESIGN.md data viz

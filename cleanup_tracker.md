# AIDOS Cleanup Tracker

> Goal mode active. Each batch = deletions or edits. Build + lint must pass after each batch.

## Inventory of Issues

| # | Category | Files / Items | Risk | Status |
|---|----------|---------------|------|--------|
| 1 | Root AI analysis/planning | `analyze-git-report.md`, `analyze-git-report.json`, `code-analysis.md` | Low | ✅ B1 |
| 2 | Root large planning docs | `delivery-analysis.md`, `field-introspection-and-asses-plan.md`, `grafana-setup.md` | Low | ✅ B1 |
| 3 | Root AI planning docs cont. | `integration-setup-external-link-plan.md`, `prometheus-analysis.md`, `prometheus-proxy-grafana.md` | Low | ✅ B2 |
| 4 | Root meeting/task docs | `STAKEHOLDER-MEETING-MINUTES.md`, `last-meeting-tasks.md`, `TODOS.md`, `todo.txt` | Low | ✅ B2 |
| 5 | Root feature doc | `feature-flag.md` | Low | ✅ B2 |
| 6 | Orphaned scripts | 10 of 13 scripts confirmed orphaned (`.cursor/` + 10 scripts) | Medium | ✅ B3 |
| 7 | `.cursor` agent/rules | `.cursor/` dir (7 files) | Medium | ✅ B3 |
| 8 | `.agents/skills/mastra/` | `.agents/skills/mastra/SKILL.md`, `reference.md`, `references/` | Medium | ⏳ B4 |
| 9 | `.agents/skills/charcoal/` | `.agents/skills/charcoal/SKILL.md`, `reference.md` | Medium | ⏳ B4 |
| 10 | `skills/aidos-*` | `skills/aidos-create-agent/`, `skills/aidos-release-assess/`, `skills/aidos-telemetry/`, `skills/aidos/` | Review | ⏳ B4 |
| 11 | Root stale release notes | `new-qa-intelligence-release.md` | Low | ⏳ B5 |
| 12 | Duplicate TS script | `scripts/sanitize-portkey-html.ts` (`.mjs` version is used) | Low | ⏳ B5 |
| 13 | Stale config | `CLAUDE.md` (11 bytes) | Low | ⏳ B5 |
| KEEP | Mastra presets | `mastra-request-context-presets.json` | — | — |
| KEEP | Landing assets | `public/portkey.html`, `public/landing.html`, `build:landing` script chain | — | — |
| DEFERRED | Referenced scripts | `scripts/migrate-adapter-type-mastra.ts`, `scripts/verify-p2-metrics.ts`, `scripts/sprint-analysis-completion.ts` — referenced in `docs/reports/` (also stale) | Low | ⏳ Review |

## Batch Execution Log

### B1 ✅ — Root AI analysis/planning (inventory #1–2)
- **Removed**: `analyze-git-report.md`, `analyze-git-report.json`, `code-analysis.md`, `delivery-analysis.md`, `field-introspection-and-asses-plan.md`, `grafana-setup.md` (staged)
- **Build**: ✅ EXIT:0
- **Lint**: ✅ EXIT:0 (1078 pre-existing lint problems — unchanged)
- **Fix**: `src/components/discovery/discovery-wizard.tsx` — added missing `Toast` and `Skeleton` imports (pre-existing build error, prerequisite for verification)

### B2 ✅ — Root planning docs cont. + meeting docs (inventory #3–5)
- **Removed**: `integration-setup-external-link-plan.md`, `prometheus-analysis.md`, `prometheus-proxy-grafana.md`, `STAKEHOLDER-MEETING-MINUTES.md`, `last-meeting-tasks.md`, `TODOS.md`, `todo.txt`, `feature-flag.md` (staged)
- **Build**: ✅ EXIT:0
- **Lint**: ✅ EXIT:0 (1078 problems — unchanged)

### B3 ✅ — Orphaned scripts + .cursor files (inventory #6–7)
- **Removed**: `.cursor/` (7 files) + 10 orphaned scripts (staged)
- **Deferred**: `scripts/migrate-adapter-type-mastra.ts`, `scripts/verify-p2-metrics.ts`, `scripts/sprint-analysis-completion.ts` — referenced in `docs/reports/`
- **Build**: ✅ EXIT:0
- **Lint**: ✅ EXIT:0 (1078 problems — unchanged)

### B4 — .agents/skills/* and skills/aidos-* (inventory #8–10)
- **Files**: `.agents/skills/mastra/`, `.agents/skills/charcoal/`, `skills/aidos-*`
- **Status**: Pending

### B5 — Remaining small files (inventory #11–13)
- **Files**: `new-qa-intelligence-release.md`, `scripts/sanitize-portkey-html.ts`, `CLAUDE.md`
- **Status**: Pending

## Decisions Log
- `scripts/agent-worker-loop.ts` kept — referenced by `worker` script.
- Landing scripts kept — referenced by `build:landing`.
- `mastra-request-context-presets.json` kept — referenced by `mastra:studio`.
- 640 pre-existing lint errors remain unfixed (not in scope per objective).
- Pre-existing `discovery-wizard.tsx` build error fixed (prerequisite for build verification).
- 3 scripts (`migrate-adapter-type-mastra.ts`, `verify-p2-metrics.ts`, `sprint-analysis-completion.ts`) deferred — referenced in stale `docs/reports/` which would also need cleanup.

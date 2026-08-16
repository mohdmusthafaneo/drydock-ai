# AIDOS Cleanup Tracker

## Summary

| Batch | Description | Files Removed | Build | Lint |
|-------|-------------|---------------|-------|------|
| B1 | Root AI analysis/planning docs | 6 | ✅ | ✅ |
| B2 | Root planning docs cont. + meeting docs | 8 | ✅ | ✅ |
| B3 | Orphaned scripts + .cursor files | 17 | ✅ | ✅ |
| B4 | .agents/skills/* and skills/aidos-* | 25 | ✅ | ✅ |
| B5 | Remaining small files | 3 | ✅ | ✅ |
| Fix | discovery-wizard.tsx missing imports | — | ✅ | ✅ |

**Total deletions: 59 files/dirs staged for deletion**

## Files Removed (all staged)

**Root docs (14):**
- `analyze-git-report.md`, `analyze-git-report.json`, `code-analysis.md`
- `delivery-analysis.md`, `field-introspection-and-asses-plan.md`, `grafana-setup.md`
- `integration-setup-external-link-plan.md`, `prometheus-analysis.md`, `prometheus-proxy-grafana.md`
- `STAKEHOLDER-MEETING-MINUTES.md`, `last-meeting-tasks.md`, `TODOS.md`, `todo.txt`, `feature-flag.md`

**Root config (2):**
- `CLAUDE.md`, `new-qa-intelligence-release.md`

**.cursor/ (7):**
- `agents/architect.md`, `agents/backend.md`, `agents/frontend.md`, `agents/orchestrator.md`
- `rules/aidos-project.mdc`, `rules/backend-scope.mdc`, `rules/frontend-scope.mdc`

**.agents/ (13):**
- `skills/charcoal/SKILL.md`, `skills/charcoal/reference.md`
- `skills/mastra/SKILL.md`, `skills/mastra/reference.md`
- `skills/mastra/references/common-errors.md`, `core-concepts.md`, `create-mastra.md`
- `skills/mastra/references/embedded-docs.md`, `mastra-api.md`, `migration-guide.md`
- `skills/mastra/references/model-selection.md`, `remote-docs.md`
- `skills/mastra/scripts/provider-registry.mjs`

**skills/aidos-* (12):**
- `aidos-create-agent/SKILL.md`, `references/agent-instruction-templates.md`
- `references/agents/devops-intelligence.md`, `governance.md`, `incident-correlation.md`
- `references/agents/integration.md`, `problem-predictor.md`, `qa-intelligence.md`
- `references/baseline-role-guide.md`
- `aidos-release-assess/SKILL.md`
- `aidos-telemetry/SKILL.md`
- `aidos/SKILL.md`, `references/api-reference.md`

**Orphaned scripts (10):**
- `scripts/analyze-sprint-spillover.ts`, `scripts/audit-connexus-platform-state.ts`
- `scripts/backfill-specialist-bundles.ts`, `scripts/connexus-fetch-and-analyze-commits.sh`
- `scripts/connexus-github-env.sh`, `scripts/connexus-github-env.ts`
- `scripts/connexus-sprint35-risk-profile.ts`, `scripts/list-observability-stub-integrations.ts`
- `scripts/preview-connexus-briefing.ts`, `scripts/query-connexus-sprint.ts`
- `scripts/sanitize-portkey-html.ts`

**Source fix:**
- `src/components/discovery/discovery-wizard.tsx` — added missing `Toast` and `Skeleton` imports (pre-existing build error, prerequisite for verification)

## Deferred

- `scripts/migrate-adapter-type-mastra.ts`, `scripts/verify-p2-metrics.ts`, `scripts/sprint-analysis-completion.ts` — referenced in stale `docs/reports/`
- `package.json` scripts cleanup — not yet done

## Final Verification

- **npm run build**: EXIT:0
- **npm run lint**: EXIT:0 (1078 pre-existing problems — unchanged from baseline)

## Kept

- `src/`, `prisma/`, `qa-onboarding/`, `docs/`, `public/landing.html` (untouched)
- `mastra-request-context-presets.json` (referenced by `mastra:studio`)
- `scripts/agent-worker-loop.ts` (referenced by `worker` script)
- Landing scripts chain (referenced by `build:landing`)
- `AGENTS.md`, `README.md`, `next.config.ts`, `prisma.config.ts` (project config)

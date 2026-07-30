# AIDOS UX Execution Plan — Phases 0–3

**Date:** 2026-07-30  
**Source proposal:** [`docs/UX-CHANGE-PROPOSAL-2026-07-30.md`](./UX-CHANGE-PROPOSAL-2026-07-30.md)  
**Status:** Active implementation

Confirmed decisions: full three-pack roadmap; setup-vs-approval split uses a **persisted Prisma `Recommendation.queue` field**.

## Lane model

| Queue | Created by | Creates Approval? | Surfaces in |
|-------|------------|-------------------|-------------|
| `SETUP` | Discovery / DNA | No | Connect hub + setup checklist |
| `OPS` | Agent analysis sync | No | Recommendations center |
| `RELEASE_GATE` | Release assess / rollback | Yes | Approval Center + dashboard counts |
| `GOVERNANCE` | Policy / autonomy | Yes | Approval Center |

## Phase summary

0. **Lane foundation** — schema, migration/backfill, create-site `queue`, stop SETUP approvals, `payloadJson.systemDismissal`
1. **Trust and activation** — release-aware counts, Approvals UI filters, checklist graduation, Jira single-truth status, mobile/hydration chrome
2. **Connect and first briefing** — guided Connect hub, gate stubs, shorten wizard, connect-first signup, post-connect handoff
3. **Read and decide clarity** — nav IA, claim-to-evidence, approval card evidence, DataTrustStrip, density, Workflow Center reframe

## Verification

- `tsx --test src/lib/recommendation-queue.test.ts`
- Connexus: `SETUP` recommendations have zero pending approvals; dashboard counts only `RELEASE_GATE` / `GOVERNANCE`
- `npm run build` before marking a phase complete

## Risks

- Backfill misclassification — reversible via `queue` updates; default was `OPS`
- Health-score shifts when approval counts become release-aware — expected, not a regression
- Nav IA rename touches feature flags and onboarding hrefs — do after checklist reduction

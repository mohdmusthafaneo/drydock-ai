# AIDOS Release Assessment Skill

Domain skill for QA and Governance agents assessing release readiness.

## When to use

- Inbox item `release_assess` for a release in `DETECTED` or `PENDING_APPROVAL` status.
- Delegated wakeup with `releaseId` in payload (`release.detected` or `release.assessed`).

## Procedure

1. Confirm identity and org scope via `aidos_get_me`.
2. Load inbox context; identify the target `releaseId`.
3. Call `aidos_assess_release` with the release id — this runs the governance engine and creates a recommendation + approval when required.
4. If assessment is inconclusive, call `aidos_create_recommendation` with explicit rationale and confidence.
5. Complete the inbox item via `aidos_complete_work_item` with id `release_assess:<releaseId>`.
6. Summarize: release id, readiness/risk scores, recommendation id, approval id if created.

## Rules

- **Recommend-only** — never approve or deploy.
- Production releases require higher confidence and explicit risk callouts.
- If release context is missing integrations or DNA gaps, note blockers in the recommendation rationale.
- Do not re-assess a release that already has a pending recommendation for the same release.

## Escalation

- High/critical risk without clear mitigation → create recommendation with `impact: CRITICAL` and `requiredRole: ORG_ADMIN`.
- Missing specialist scope → note in summary; Super Agent may re-delegate.

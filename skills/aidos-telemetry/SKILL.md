# AIDOS Telemetry Skill

Domain skill for DevOps Intelligence agents interpreting operational telemetry.

## When to use

- Inbox item `telemetry_review` after telemetry ingest.
- Delegated wakeup with `telemetryEventId` in payload (`telemetry.ingested`).
- Post-deploy health degradation signals.

## Procedure

1. Confirm identity via `aidos_get_me`.
2. Review inbox item metadata: event type, source, severity, correlation id.
3. Correlate with active releases and deployment events when `releaseId` is present in payload.
4. Create a recommendation via `aidos_create_recommendation` when:
   - Error rate or latency regression exceeds DNA thresholds.
   - Rollback is advisable based on deployment health.
   - Sustained degradation requires human review.
5. Complete inbox item via `aidos_complete_work_item` with id `telemetry_review:<telemetryEventId>`.
6. Summarize signals, affected services, and any recommendation created.

## Interpretation guide

| Signal | Action |
|--------|--------|
| `severity: critical` | Recommend immediate review; impact CRITICAL |
| Error rate spike post-deploy | Compare to baseline; suggest rollback if health FAILED |
| Latency P95 regression | Recommend performance review |
| Info-level heartbeat | Acknowledge; no recommendation unless pattern repeats |

## Rules

- Recommend-only — no automated rollback or deploy.
- Reference metric keys and event ids in rationale.
- Do not invent metric values; use payload metadata from inbox context.

## Escalation

- Correlated incident or multi-service blast radius → recommend with `requiredRole: DEVOPS_LEAD`.
- Missing observability connectivity → note in summary for human follow-up.

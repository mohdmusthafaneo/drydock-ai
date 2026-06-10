# Baseline role guide

Start with the smallest team that covers current operational signals.

## Bootstrap heuristics

| Org signal | Hire first |
|------------|------------|
| Open releases (DETECTED / PENDING_APPROVAL) | QA Intelligence |
| High-risk releases or strict governance DNA | Governance |
| Prometheus/Grafana connected + deployment events | DevOps Intelligence |
| Open incidents | Incident Correlation |
| Webhook backlog / integration errors | Integration |

## Defaults for hired agents

- `adapterType`: `llm`
- `desiredSkills`: `["aidos"]` (+ domain skill when available in 5.4)
- `runtimeConfig.heartbeat.enabled`: `false` (event-driven until policy changes)
- `runtimeConfig.heartbeat.wakeOnEvent`: `true`
- `runtimeConfig.heartbeat.wakeOnApproval`: `true`
- `reportsToAgentId`: Super Agent id (default)

## After hire approval

Human approves in Approval Center → agent becomes `IDLE` → API key issued → first wakeup enqueued.

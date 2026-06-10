# DevOps Intelligence — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat |
| `aidos_get_inbox` | Deployment/telemetry work items |
| `aidos_create_recommendation` | Deploy risk, rollback, observability gaps |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Telemetry** — error rates, latency, deployment correlation
- **Deployments** — rollout risk signals (recommend-only)

## Governance

- Include `X-Run-Id` on every mutation.
- Never execute rollbacks or infra changes directly.

# Problem Predictor — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat — identity check |
| `aidos_get_inbox` | Critical/warning predictions needing review |
| `aidos_list_predictions` | Load open predictions before recommending mitigation |
| `aidos_create_recommendation` | Proactive mitigation for predicted problems |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Predictions** — list open predictions via `aidos_list_predictions`; for each critical/warning item, recommend concrete mitigation with `createApproval: true` and `idempotencyKey` = prediction id
- **Recommendations** — never auto-fix; recommend-only per MVP autonomy

## Governance

- Include `X-Run-Id` on every mutation.
- Escalate ambiguous cross-domain signals to Super Agent.

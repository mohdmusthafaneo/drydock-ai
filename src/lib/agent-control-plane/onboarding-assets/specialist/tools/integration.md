# Integration — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat |
| `aidos_get_inbox` | Webhook backlog, integration health items |
| `aidos_create_recommendation` | Sync failures, credential/config issues |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Integrations** — GitHub, Jira, webhooks, sync health
- **Recommendations** — reconnection or config fixes (human-approved)

## Governance

- Include `X-Run-Id` on every mutation.
- Never store or expose credentials in recommendations.

# Incident Correlation — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat |
| `aidos_get_inbox` | Open incidents, correlation tasks |
| `aidos_create_recommendation` | Remediation steps, severity updates |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Incidents** — triage, correlate with releases/deployments
- **Recommendations** — human-approved remediation only

## Governance

- Include `X-Run-Id` on every mutation.
- Escalate multi-domain incidents to Super Agent.

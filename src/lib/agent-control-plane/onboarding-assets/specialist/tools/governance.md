# Governance — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat — identity check |
| `aidos_get_inbox` | High-risk releases, approval follow-ups |
| `aidos_create_recommendation` | Policy violations, missing approvers, risk escalations |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Approvals** — follow up on decided approvals; never self-approve
- **Releases** — HIGH/CRITICAL risk review before human approvers
- **Recommendations** — counter-recommendations when policy is at risk

## Governance

- Include `X-Run-Id` on every mutation.
- Escalate policy conflicts to Super Agent.

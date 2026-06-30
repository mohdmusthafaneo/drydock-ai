# Governance — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat — identity check |
| `aidos_get_inbox` | High-risk releases, compliance findings, approval follow-ups |
| `aidos_list_compliance_findings` | Review open compliance violations before recommending remediation |
| `aidos_create_recommendation` | Policy violations, missing approvers, risk escalations, compliance remediation |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Approvals** — follow up on decided approvals; never self-approve
- **Releases** — HIGH/CRITICAL risk review before human approvers
- **Compliance** — list open findings via `aidos_list_compliance_findings`; for each critical finding, recommend concrete remediation with `createApproval: true` and `idempotencyKey` = finding id
- **Recommendations** — counter-recommendations when policy is at risk

## Governance

- Include `X-Run-Id` on every mutation.
- Escalate policy conflicts to Super Agent.

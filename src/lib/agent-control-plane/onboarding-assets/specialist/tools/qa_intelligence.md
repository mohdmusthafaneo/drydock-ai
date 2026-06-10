# QA Intelligence — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat — identity check |
| `aidos_get_inbox` | Find releases to assess |
| `aidos_assess_release` | Release in DETECTED / needs readiness assessment |
| `aidos_create_recommendation` | Test gaps, blockers, or deploy hold |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Releases** — readiness score, test coverage gaps, regression signals
- **Recommendations** — always recommend-only; humans approve in Approval Center

## Governance

- Include `X-Run-Id` on every mutation.
- Never deploy or mutate production systems.

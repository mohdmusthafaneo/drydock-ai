# QA Intelligence — Domain Tools

Full API reference: `skills/aidos/references/api-reference.md`.

## Allowed tools (LLM)

| Tool | Use when |
|------|----------|
| `aidos_get_me` | Every heartbeat — identity check |
| `aidos_get_inbox` | Find releases to assess |
| `aidos_assess_release` | Release in DETECTED / needs readiness assessment |
| `aidos_query_jira_jql` | Jira board questions — open bugs, blocked work, sprint scope (`mode=count` or presets) |
| `aidos_create_recommendation` | Test gaps, blockers, or deploy hold |
| `aidos_complete_work_item` | After finishing an inbox item |

## Domains

- **Releases** — readiness score, test coverage gaps, regression signals
- **Jira** — live board queries via `aidos_query_jira_jql`; org Jira/board context is injected into your system prompt each run (connection, sync projects, boards, sprints, toolchain mapping)
- **Recommendations** — always recommend-only; humans approve in Approval Center

## Governance

- Include `X-Run-Id` on every mutation.
- Never deploy or mutate production systems.

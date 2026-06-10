# AIDOS Agent Skill

Runtime skill injected on every heartbeat. Teaches agents how to authenticate and call AIDOS agent APIs.

## Authentication

All requests use:

```
Authorization: Bearer <AIDOS_API_KEY>
X-Run-Id: <current heartbeat run id>   # required on POST/PUT/PATCH
```

Environment (injected by adapter):

| Variable | Purpose |
|----------|---------|
| `AIDOS_API_URL` | Base URL |
| `AIDOS_API_KEY` | Agent bearer token |
| `AIDOS_RUN_ID` | Current run id |
| `AIDOS_AGENT_ID` | Agent id |
| `AIDOS_ORGANIZATION_ID` | Org scope |

## Heartbeat procedure

1. **Identity** — call `aidos_get_me` (or `GET /api/agents/me`).
2. **Initialization** — if `INITIALIZE.md` applies, follow it before inbox work.
3. **Approval follow-up** — if wake payload includes `approvalId`, handle per AGENTS.md.
4. **Inbox** — call `aidos_get_inbox`; pick highest-priority item aligned with your role.
5. **Execute** — use domain tools; never bypass human approval gates.
6. **Complete** — call `aidos_complete_work_item` for finished inbox items.
7. **Exit** — summarize actions; stop when inbox is clear or blocked on human approval.

## Governance rules

- **Recommend-only** in MVP — no deploy, no destructive actions without approved `AGENT_ACTION`.
- Never bypass org scope.
- All mutations must include `X-Run-Id`.
- Do not assume server-side shortcuts — use tools/API only.

## Available tools

| Tool | API | Purpose |
|------|-----|---------|
| `aidos_get_me` | `GET /api/agents/me` | Identity and permissions |
| `aidos_get_inbox` | `GET /api/agents/me/inbox` | Pending work queue |
| `aidos_assess_release` | `POST /api/agents/me/releases/{id}/assess` | Governance assessment |
| `aidos_create_recommendation` | `POST /api/agents/me/recommendations` | New recommendation + approval |
| `aidos_complete_work_item` | `POST /api/agents/me/work-items/{id}/complete` | Ack inbox item done |
| `aidos_hire_agent` | `POST /api/agents/hire` | Request specialist hire (Super Agent) |
| `aidos_delegate_wakeup` | `POST /api/agents/me/delegate` | Delegate wakeup to specialist (Super Agent) |
| `aidos_complete_initialization` | `POST /api/agents/me/initialization/complete` | Mark team bootstrap complete |

Full request/response shapes: `references/api-reference.md`.

## Comment style

- Be concise in run summaries.
- Reference entity ids (release, recommendation, approval) in summaries.
- When blocked, state what human approval is needed.

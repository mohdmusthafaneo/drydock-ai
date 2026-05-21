# AIDOS multi-agent workflow

**Plan first:** [MVP-DEVELOPMENT-PLAN.md](./MVP-DEVELOPMENT-PLAN.md)

## Quick reference

| Step | Agent | Example prompt |
|------|-------|----------------|
| 1 | `/orchestrator` | Plan Jira integration stub with frozen API contract |
| 2 | `/backend` | Implement `POST /api/integrations/jira/connect` |
| 3 | `/frontend` | Add Jira card on integrations page with connect flow |
| 4 | `/architect` | Review Jira integration for tenancy and audit requirements |

## Example: full feature slice

**You (in Cursor Agent chat):**

> /orchestrator I need email notification when a recommendation is approved. Plan tasks for backend and frontend.

**Then:**

> /backend Implement approval notification stub (log + ActivityEvent; no SendGrid yet)

> /frontend Show toast/banner on approvals page after successful approve

> /architect Review the approval notification slice

## Tips

- **Architect is read-only** — it returns a review report, not code.
- **Descriptions matter** — Cursor picks subagents from the `description` field in each agent file.
- **Explicit beats vague** — `/frontend Fix discovery wizard step indicators` works better than "fix UI".
- **Check agents exist** — Settings or list `.cursor/agents/` in the repo.

## Files added for this setup

```
.cursor/
  agents/
    frontend.md      # UI specialist
    backend.md       # API & data specialist
    architect.md     # Read-only reviewer
    orchestrator.md  # Coordinator (optional)
  rules/
    aidos-project.mdc
    frontend-scope.mdc
    backend-scope.mdc
AGENTS.md            # Team overview (this repo root)
docs/AGENT-WORKFLOW.md
```

Commit `.cursor/` to git so the whole team shares the same agents.

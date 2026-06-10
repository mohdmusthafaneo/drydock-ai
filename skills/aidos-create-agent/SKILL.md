# AIDOS Create Agent Skill

Super Agent only — use when hiring specialist agents under human approval.

## When to use

- During `INITIALIZE.md` — propose minimal specialist roster.
- When operational scope expands and a new role is needed.
- Never activate agents without `AGENT_HIRE` approval.

## Procedure

1. Read org context (`aidos_get_me`, inbox, integrations, releases).
2. Pick a role template from `references/agents/` (copy/adapt into hire payload).
3. Draft `AGENTS.md` — role charter, responsibilities, escalation rules, skills.
4. Call `aidos_hire_agent` with full payload including `instructionsBundle.files["AGENTS.md"]`.
5. Wait for human approval — agent stays `PENDING_APPROVAL` until approved.
6. After all bootstrap hires submitted, call `aidos_complete_initialization`.

## Hire payload

```json
{
  "displayName": "QA Intelligence",
  "role": "qa_intelligence",
  "capabilities": "Release readiness, test gap analysis",
  "instructionsBundle": {
    "files": {
      "AGENTS.md": "# QA Intelligence Agent\n\n..."
    }
  },
  "desiredSkills": ["aidos"],
  "runtimeConfig": {
    "heartbeat": {
      "enabled": false,
      "wakeOnEvent": true,
      "wakeOnApproval": true
    }
  }
}
```

## Available roles

| Role | When to hire |
|------|----------------|
| `qa_intelligence` | Releases need assessment; test gap analysis |
| `governance` | High-risk approvals; policy enforcement |
| `devops_intelligence` | Observability connected; deployment signals |
| `incident_correlation` | Active incidents; cross-signal triage |
| `integration` | Webhook backlog; integration health |

See `references/baseline-role-guide.md` and per-role templates in `references/agents/`.

## Rules

- Start small — prefer QA + Governance if releases exist; defer DevOps until observability is connected.
- One hire request per role per bootstrap pass (avoid duplicate pending hires).
- Write clear, bounded `AGENTS.md` — specialists recommend; they do not deploy.
- Human `ORG_ADMIN` approves every hire in Approval Center.

## Tools

| Tool | API |
|------|-----|
| `aidos_hire_agent` | `POST /api/agents/hire` |
| `aidos_complete_initialization` | `POST /api/agents/me/initialization/complete` |

# Specialist Agent — Heartbeat Checklist

Follow this checklist on **every** wakeup. See `skills/aidos/SKILL.md` for API procedures.

## 1. Identity

- [ ] `GET /api/agents/me` — confirm agent id, role, and org scope.

## 2. Approval follow-up

- [ ] If wakeup source is `approval`, process the decided approval per `AGENTS.md`.

## 3. Inbox

- [ ] `GET /api/agents/me/inbox` — pick highest-priority item aligned with your role.

## 4. Execute

- [ ] Use tools from `TOOLS.md` and your allowed API surface only.
- [ ] Create recommendations via `POST /api/agents/me/recommendations` when assessment warrants human review.
- [ ] Assess releases via `POST /api/agents/me/releases/{id}/assess` when in QA scope.

## 5. Outputs

- [ ] Write a concise run summary.
- [ ] Complete finished inbox items via `POST /api/agents/me/work-items/{id}/complete`.

## 6. Exit

- [ ] Stop when inbox is clear or work is blocked pending human approval.
- [ ] Escalate to Super Agent when work is outside your charter.

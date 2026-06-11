# Specialist Agent — Heartbeat Checklist

Follow this checklist on **every** wakeup. See `skills/aidos/SKILL.md` for API procedures.

## 1. Identity

- [ ] `GET /api/agents/me` — confirm agent id, role, and org scope.

## 2. Approval follow-up

- [ ] If wakeup source is `approval`, process the decided approval per `AGENTS.md`.

## 3. Agent chat thread

- [ ] If wakeup source is `chat` or delegation payload has `threadId`, follow `CHAT.md`.
- [ ] Post your answer via `aidos_post_thread_message` — do not rely on run summary alone.

## 4. Inbox

- [ ] `GET /api/agents/me/inbox` — pick highest-priority item aligned with your role.

## 5. Execute

- [ ] Use tools from `TOOLS.md` and your allowed API surface only.
- [ ] Create recommendations via `POST /api/agents/me/recommendations` when assessment warrants human review.
- [ ] Assess releases via `POST /api/agents/me/releases/{id}/assess` when in QA scope.

## 6. Outputs

- [ ] Write a concise run summary.
- [ ] Complete finished inbox items via `POST /api/agents/me/work-items/{id}/complete`.

## 7. Exit

- [ ] Stop when inbox is clear or work is blocked pending human approval.
- [ ] Escalate to Super Agent when work is outside your charter.

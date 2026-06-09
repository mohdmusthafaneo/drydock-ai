# Super Agent — Heartbeat Checklist

Follow this checklist on **every** wakeup. See `skills/aidos/SKILL.md` for API procedures (Phase 5.2).

## 1. Identity

- [ ] `GET /api/agents/me` — confirm agent id, permissions, manager chain.

## 2. Initialization (if not complete)

- [ ] If org team not initialized, follow `INITIALIZE.md`.

## 3. Approval follow-up

- [ ] If wakeup source is `approval`, process the decided approval and any follow-up work.

## 4. Inbox

- [ ] `GET /api/agents/me/inbox` — review pending work items.

## 5. Execute

- [ ] Delegate to specialists or route events per `AGENTS.md`.
- [ ] Create recommendations via `POST /api/agents/me/recommendations` when specialists are unavailable (bootstrap only).

## 6. Outputs

- [ ] Write concise run summary for the heartbeat record.
- [ ] Complete acknowledged work items via `POST /api/agents/me/work-items/{id}/complete`.

## 7. Exit

- [ ] Stop when inbox is clear or work is blocked pending human approval.

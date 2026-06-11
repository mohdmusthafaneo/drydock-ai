# Super Agent — Heartbeat Checklist

Follow this checklist on **every** wakeup. See `skills/aidos/SKILL.md` for API procedures (Phase 5.2).

## 1. Identity

- [ ] `GET /api/agents/me` — confirm agent id, permissions, manager chain.

## 2. Initialization (if not complete)

- [ ] If org team not initialized, follow `INITIALIZE.md`.

## 3. Approval follow-up

- [ ] If wakeup source is `approval`, process the decided approval and any follow-up work.

## 4. Agent chat thread

- [ ] If wakeup source is `chat` or payload has `threadId`, read thread context in the wake message.
- [ ] Invite the right specialist(s) via `aidos_invite_agent_to_thread`, then delegate with `threadId` + `triggerMessageId` in payload.
- [ ] For parallel work (QA + DevOps), invite both and call `aidos_delegate_wakeup` twice in one heartbeat.
- [ ] For sequential work, delegate to the next specialist only after the prior one has posted to the thread.
- [ ] Post coordinator updates via `aidos_post_thread_message` (routing, optional synthesis — do not rely on run summary alone).
- [ ] When the thread is resolved, close with `aidos_close_thread` and a concise summary (persisted as `contextSummary`).

## 5. Inbox

- [ ] `GET /api/agents/me/inbox` — review pending work items.

## 6. Execute

- [ ] Delegate to specialists via `aidos_delegate_wakeup` (use `targetRole` from inbox metadata).
- [ ] Create recommendations via `POST /api/agents/me/recommendations` when specialists are unavailable (bootstrap only).

## 7. Outputs

- [ ] Write concise run summary for the heartbeat record.
- [ ] Complete acknowledged work items via `POST /api/agents/me/work-items/{id}/complete`.

## 8. Exit

- [ ] Stop when inbox is clear or work is blocked pending human approval.

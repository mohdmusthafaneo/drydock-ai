# Agent Heartbeat Protocol

**Status:** Stub (Phase 5a) · See [ai-agents-workflow.md](./ai-agents-workflow.md) for full plan.

Agents run in **bounded heartbeats** triggered by the wakeup queue — not continuously. External cron calls `POST /api/platform/agents/worker` every 30–60s to drain the queue and run timer-based wakeups.

## Authentication

```
Authorization: Bearer <agent_api_key>
```

API keys are issued per agent (hash stored in DB). Include `X-Run-Id: {heartbeatRunId}` on mutating calls during an active heartbeat (Phase 5b+).

## Step 1 — Identity

```
GET /api/agents/me
Authorization: Bearer <key>
```

Returns agent identity, organization, permissions, runtime config, and manager chain.

## Step 2 — Approval follow-up

When woken with `source=approval`, read `payload.approvalId` and the human decision from the approval record. Perform allowed follow-up only (no auto-execution without `AGENT_ACTION` approval — Phase 5e).

## Step 3 — Inbox (Phase 5b)

```
GET /api/agents/me/inbox
```

Returns prioritized work items (releases, webhooks, etc.).

## Step 4 — Execute

Use allowlisted tools only. Phase 5a uses an in-process stub adapter; Phase 5b adds OpenAI + tool registry.

## Step 5 — Write outputs

- Create `Recommendation` + `Approval` when human sign-off is required (Phase 5b).
- Always write `ActivityEvent` and `AuditLog` with `actorType: agent`.
- Update `lastHeartbeatAt`; set agent status back to `IDLE`.

## Step 6 — Exit

The adapter records `AgentHeartbeatRun` result (summary, token usage, errors).

## Worker setup

```bash
# Every 30–60s (example cron)
curl -X POST "$APP_URL/api/platform/agents/worker" \
  -H "Authorization: Bearer $PLATFORM_WORKER_SECRET"
```

Optional body: `{ "organizationId": "..." }` to scope to one org.

Environment:

| Variable | Purpose |
|----------|---------|
| `PLATFORM_WORKER_SECRET` | Worker auth (shared with Jira/Grafana sync) |
| `AGENT_WORKER_ENABLED` | Set `false` to disable agent worker |
| `AGENT_DEFAULT_HEARTBEAT_SEC` | Lead orchestrator timer interval (default 900) |
| `OPENAI_API_KEY` | BYOK for internal adapter (Phase 5b+) |

# Agent Heartbeat Protocol

**Status:** Active (Mastra + skills model) · See [ai-agents-workflow.md](./ai-agents-workflow.md) · [migration-plan.md](./migration-plan.md)

Runtime agents are **LLM workers** orchestrated by **Mastra** — not server-side rule engines. Each heartbeat, the Mastra adapter loads the agent's **`AGENTS.md`** and the shared **`skills/aidos/SKILL.md`**, then runs a Mastra agent/workflow with tools that call AIDOS agent APIs.

> **Note:** [AGENTS.md](../AGENTS.md) at the repo root is for **Cursor development subagents**. Runtime agents use managed instructions at `organizations/{orgId}/agents/{agentId}/instructions/AGENTS.md`.

---

## Execution path

```text
Worker drain → runMastraAdapter
  → loadAgentInstructionContext (AGENTS.md + skills)
  → heartbeatWorkflow | chatRoutingWorkflow
  → Mastra agent + AIDOS tools (HTTP to /api/agents/me/*)
  → AgentHeartbeatRun (summary, mastraRunId, mastraTraceId, token rollup)
```

Detailed traces live in **Mastra storage** (LibSQL + DuckDB observability). Prisma stores governance pointers on `AgentHeartbeatRun`.

---

## Environment (injected by adapter)

| Variable | Purpose |
|----------|---------|
| `AIDOS_API_URL` | Base URL (e.g. `http://localhost:3000`) |
| `AIDOS_API_KEY` | Bearer token for agent auth (ephemeral per run) |
| `AIDOS_AGENT_ID` | Current agent id |
| `AIDOS_ORGANIZATION_ID` | Org scope |
| `AIDOS_RUN_ID` | Current heartbeat run id — **required on all mutating API calls** |
| `AIDOS_WAKE_REASON` | e.g. `release.detected`, `manual.invoke`, `approval.approved`, `chat.human_message` |
| `AIDOS_WAKE_PAYLOAD_JSON` | Compact wake context (releaseId, approvalId, threadId, etc.) |

Mastra tools receive the same context via `createAidosToolContext` (API key, run id, wake payload).

---

## Context loaded every wakeup

1. **`skills/aidos/SKILL.md`** — API procedures, governance rules, heartbeat steps.
2. **Managed `AGENTS.md`** — role charter written by Super Agent (or default for Super).
3. **`HEARTBEAT.md`** (if present) — per-agent checklist.
4. **Wake delta** — reason, payload, scoped entity ids.

The LLM follows these documents. The adapter does **not** branch on `agentType` in code — tool allowlists are applied per agent type in `src/mastra/agents/toolsets.ts`.

---

## Authentication

```
Authorization: Bearer <AIDOS_API_KEY>
X-Run-Id: <AIDOS_RUN_ID>    # required on POST/PATCH/PUT
```

---

## Heartbeat procedure

Follow `skills/aidos/SKILL.md` every time. Summary:

### Step 1 — Identity

```
GET /api/agents/me
```

Confirm id, organization, permissions (`canCreateAgents`), manager chain.

### Step 2 — Initialization (Super Agent only, first runs)

If `INITIALIZE.md` applies and org not yet initialized:

1. Read org context (DNA, integrations, releases).
2. Draft minimal specialist roster.
3. For each role: write `AGENTS.md`, submit `POST /api/agents/hire` with `instructionsBundle`.
4. `POST /api/agents/me/initialization/complete` when proposals submitted.

Use `skills/aidos-create-agent/SKILL.md` for hire procedure.

### Step 3 — Approval follow-up

If wake payload includes `approvalId`:

- Read approval decision.
- If `AGENT_HIRE` approved: note new agent id; optionally wake them.
- If recommendation approval: perform allowed follow-up per AGENTS.md.
- Never auto-execute side effects without `AGENT_ACTION` approval.

### Step 4 — Inbox

```
GET /api/agents/me/inbox
```

Prioritized work items (releases, webhooks, incidents). The LLM decides which item to act on per AGENTS.md priorities.

### Step 5 — Execute (LLM-driven)

Use API tools defined in SKILL.md. Examples:

- `POST /api/agents/me/releases/{id}/assess`
- `POST /api/agents/me/recommendations`
- `POST /api/agents/hire` (Super Agent + permission)
- `POST /api/agents/me/work-items/{id}/complete`

Domain rule engines run **behind** these API routes — agents never call lib functions directly.

### Step 6 — Write outputs

- Create `Recommendation` + `Approval` when human sign-off required.
- Write `ActivityEvent` + `AuditLog` (`actorType: agent`).
- Summarize actions in run log before exit.

### Step 7 — Exit

Adapter records `AgentHeartbeatRun`: summary, token usage, `mastraRunId`, `mastraTraceId`, errors.

---

## Critical rules

- Read **AGENTS.md** every wakeup — responsibilities live there, not in server code.
- Follow **SKILL.md** for all API interactions.
- **Recommend-only** — no deploy, Jira push, or destructive actions without approved `AGENT_ACTION`.
- Never bypass org scope.
- If `ANTHROPIC_API_KEY` missing, heartbeat fails — no silent fallback.

---

## Worker setup

```bash
# Every 30–60s (production cron)
curl -X POST "$APP_URL/api/cron/agents/worker" \
  -H "Authorization: Bearer $PLATFORM_WORKER_SECRET"
```

Invoke from UI **queues** a wakeup and polls until the worker completes it. In dev, run `npm run worker:agents` in a second terminal (or schedule `POST /api/cron/agents/worker` in production).

| Variable | Purpose |
|----------|---------|
| `PLATFORM_WORKER_SECRET` | Worker auth |
| `ANTHROPIC_API_KEY` | Required for Mastra model provider |
| `ANTHROPIC_BASE_URL` | Anthropic Messages API base (default MiniMax-compatible endpoint) |
| `ANTHROPIC_MODEL` | Model id (e.g. `MiniMax-M3`) |
| `MASTRA_STORAGE_URL` | LibSQL store, e.g. `file:/data/mastra/store.db` |
| `MASTRA_OBSERVABILITY_PATH` | DuckDB traces path, e.g. `/data/mastra/observability.duckdb` |
| `AIDOS_API_URL` | Agent adapter → API tool calls (defaults to `NEXT_PUBLIC_APP_URL`) |
| `AGENT_WORKER_ENABLED` | Set `false` to disable |
| `AGENT_WORKER_INTERVAL_SEC` | Dev loop interval for `npm run worker:agents` (default 15) |
| `AGENT_DEFAULT_HEARTBEAT_SEC` | Super Agent timer (default 900) |

**Production:** Mount shared `/data/agent-instructions` on web + worker containers. Mastra state lives in Postgres (`@mastra/pg`), not a file volume.

**Load test:** `npm run load-test:chat-wakeups` — enqueues concurrent chat wakeups and verifies worker drain.

---

## Trace lookup

- **Run summary:** Agents UI → run detail → `mastraRunId` / `mastraTraceId` link.
- **Detailed spans:** Mastra storage (DuckDB observability domain) or `npm run mastra:studio` in local dev.

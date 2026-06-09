# AIDOS AI Agents — Implementation Plan

**Status:** Draft · **Last updated:** 2026-06-09  
**Audience:** Engineering (backend, frontend, architect)  
**Reference:** Adapted from [Paperclip minimal agent control plane](file:///Users/musthafa/warehouse/paperclip/doc/minimal-agent-control-plane-guide.md)

---

## 1. Executive summary

AIDOS needs a **governed agent control plane** — not an autonomous agent product. Agents **observe, correlate, and recommend**; humans **approve** via the existing approval center; the control plane records **what ran, when, and why**.

This document defines phased implementation from today’s static `AgentRegistry` (labels on rule-engine output) to a working **lead orchestrator + specialist agents** system with heartbeats, event-driven wakeups, and dynamic agent creation under human approval.

**Core loop to prove:**

```
Event or timer → enqueue wakeup → heartbeat run → agent produces recommendation
    → approval center → human decides → wakeup requesting agent for follow-up
```

**Product alignment:** [AIDOS-USP.md](./AIDOS-USP.md) — lead with governance and operational intelligence, not “more autonomous agents.”

**Roadmap slot:** Enterprise [Phase 5 — Agentic orchestration](./AIDOS-ENTERPRISE-ROADMAP.md#phase-5--agentic-orchestration-layer-68-weeks), delivered incrementally as **5a → 5f** without blocking MVP Accelerator sprints.

---

## 2. What we are building (and what we are not)

### 2.1 Control plane, not agent runtime

| Layer | Responsibility | AIDOS location |
|-------|----------------|----------------|
| Human UI | Approvals, agent visibility, manual invoke | `(platform)/approvals`, `(platform)/agents` |
| Control plane API | Agents, wakeups, runs, governance | `src/app/api/agents/**`, `src/lib/agent-control-plane/**` |
| Background worker | Timer heartbeats, queue drain, stuck-run detection | `POST /api/platform/agents/worker` |
| Adapters | How to invoke agent logic | `src/lib/agent-control-plane/adapters/**` |
| Agent logic | LLM + domain tools | In-process (`internal` adapter) first |

Agents do **not** run continuously. They run in **heartbeats** — bounded execution windows triggered by a wakeup queue.

### 2.2 Deliberate differences from Paperclip

Paperclip optimizes for **autonomous software-company building** (issues, checkout, hire engineers, code workspaces). AIDOS optimizes for **operational intelligence** (releases, telemetry, incidents, recommendations).

| Paperclip concept | AIDOS equivalent | Build? |
|-------------------|------------------|--------|
| Company | `Organization` | Exists |
| Chief agent (CEO) | `SUPER_ORCHESTRATOR` | Extend |
| Specialist agents | `AgentRegistry` rows | Extend |
| Issues / tasks | `Recommendation`, `Release`, `Incident`, `WebhookEvent` | Reuse — **no issue tracker** |
| Hire agent approval | `Approval` with `type = AGENT_HIRE` | Extend |
| Heartbeat runs | `AgentHeartbeatRun` | **New** |
| Wakeup queue | `AgentWakeupRequest` | **New** |
| Agent API key | `AgentApiKey` | **New** |
| Atomic checkout / 409 | — | **Skip** (no concurrent coding agents) |
| Budget / workspaces / plugins | — | **Defer** |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Human operator UI                                              │
│  Dashboard · Approvals · Agents · Releases · Integrations       │
├─────────────────────────────────────────────────────────────────┤
│  Control plane (Next.js API + lib)                              │
│  enqueueWakeup · inbox · agent auth · approval hooks            │
├─────────────────────────────────────────────────────────────────┤
│  Worker (external cron → POST /api/platform/agents/worker)      │
│  Timer due agents · claim queue · invoke adapter · record run   │
├─────────────────────────────────────────────────────────────────┤
│  Adapters                                                       │
│  internal (LLM in-process) · http (external worker, later)      │
└─────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
   Lead Orchestrator                   Specialist agents
   (SUPER_ORCHESTRATOR)                (QA, DevOps, Incident, Integration, …)
         │                                    │
         └──────── API key auth ──────────────┘
                         │
                         ▼
              Recommendations → Approvals → Audit
```

### 3.1 Agent roles

| Agent type | Mode | Woken by | Primary outputs |
|------------|------|----------|-----------------|
| `SUPER_ORCHESTRATOR` | ASSIST | Timer, on-demand, approval follow-up | Delegation, agent hire requests, ops summary |
| `QA_INTELLIGENCE` | RECOMMEND | Release detected/assessed, timer | Release readiness recommendations |
| `DEVOPS_INTELLIGENCE` | RECOMMEND | Telemetry ingest, Grafana/Prometheus webhook | Deployment risk, rollback recommendations |
| `INCIDENT_CORRELATION` | OBSERVE → RECOMMEND | Alert webhooks, post-deploy comparison | Incidents, correlated recommendations |
| `GOVERNANCE` | RECOMMEND | High-risk assessment, policy triggers | Governance recommendations, escalation |
| `INTEGRATION` | OBSERVE | GitHub/Jira webhooks | Process webhook backlog, trigger downstream wakeups |

Dynamic agents (created by lead, approved by human) use the same runtime; `agentType` may become a string field or `CUSTOM` enum value in a later phase.

---

## 4. Wakeup system

All wakeups flow through **one service**. No caller invokes adapters directly.

### 4.1 Wakeup sources

| Source | Trigger | Example `reason` |
|--------|---------|------------------|
| `timer` | Heartbeat interval elapsed | `heartbeat.timer` |
| `event` | Domain mutation or webhook | `release.detected`, `webhook.grafana`, `telemetry.ingested` |
| `approval` | Human decided an approval | `approval.approved`, `approval.rejected` |
| `on_demand` | Human clicks Invoke in UI | `manual.invoke` |
| `delegation` | Lead assigns work to specialist | `delegation.assigned` |

### 4.2 Queue invariants (do not break)

1. **Max one active run per agent** — coalesce duplicate wakeups for same agent while `queued` or `running`.
2. **DB-backed queue** — survives process restarts.
3. **FIFO** with priority: `on_demand` > `approval` / `delegation` > `event` > `timer`.
4. **Do not wake** agents in `PAUSED`, `PENDING_APPROVAL`, `TERMINATED`, or `ERROR` (configurable retry for ERROR).
5. **Org scope** — every query filters by `organizationId`.
6. **Idempotency** — webhook and approval handlers pass `idempotencyKey` to prevent duplicate runs.

### 4.3 Per-agent heartbeat policy

Stored in `AgentRegistry.runtimeConfigJson`:

```json
{
  "heartbeat": {
    "enabled": true,
    "intervalSec": 900,
    "wakeOnEvent": true,
    "wakeOnApproval": true,
    "wakeOnDelegation": true,
    "cooldownSec": 30,
    "maxRunDurationSec": 300
  }
}
```

Defaults: Lead Orchestrator `intervalSec: 900`; specialists `intervalSec: 0` (event-driven only) unless enabled in UI.

### 4.4 Worker pattern

Reuse the existing platform worker auth (`PLATFORM_WORKER_SECRET`, `src/lib/platform-worker-auth.ts`):

```
POST /api/platform/agents/worker
Authorization: Bearer $PLATFORM_WORKER_SECRET
Body (optional): { "organizationId": "..." }
```

External cron (every 30–60s) calls this route. The handler:

1. Finds agents with timer policy due (`now - lastHeartbeatAt >= intervalSec`).
2. Enqueues timer wakeups.
3. Claims pending `AgentWakeupRequest` rows (FIFO + priority).
4. Creates `AgentHeartbeatRun`, invokes adapter, records result.
5. Optionally cancels runs exceeding `maxRunDurationSec`.

No in-repo long-running process required for v1 (consistent with Jira/Grafana sync workers).

---

## 5. Data model

### 5.1 Extend `AgentRegistry`

```prisma
enum AgentStatus {
  IDLE
  ACTIVE          // legacy — map to IDLE after migration
  RUNNING
  PAUSED
  PENDING_APPROVAL
  DEGRADED
  ERROR
  TERMINATED
}

// New fields on AgentRegistry:
//   reportsToAgentId   String?   @relation("AgentReportsTo", ...)
//   adapterType        String    @default("internal")  // internal | http
//   adapterConfigJson  String    @default("{}")
//   runtimeConfigJson  String    @default("{}")
//   permissionsJson    String    @default("{}")       // { canCreateAgents: false }
//   lastHeartbeatAt    DateTime?
//   createdByAgentId   String?   // set when lead hires agent
```

Keep `@@unique([organizationId, agentType])` for built-in types. Phase 5e adds `AgentInstance` or relaxes uniqueness for custom agents.

### 5.2 New tables

```
AgentApiKey
  id, organizationId, agentId, keyHash, label, revokedAt, createdAt
  @@index([agentId])

AgentWakeupRequest
  id, organizationId, agentId, source, reason, status,  // queued|running|completed|skipped|coalesced
  payloadJson, idempotencyKey, coalescedCount,
  requestedAt, startedAt, finishedAt, error

AgentHeartbeatRun
  id, organizationId, agentId, wakeupRequestId,
  status,  // running|succeeded|failed|timed_out|cancelled
  source, reason, contextSnapshotJson,
  startedAt, finishedAt, exitCode, error, summary,
  tokenUsageJson, logsJson

AgentWorkItem (optional Phase 5b — explicit inbox)
  id, organizationId, agentId, workType,  // release_assess|incident_triage|webhook_process|approval_followup
  entityType, entityId, status, priority, assignedAt, completedAt
```

### 5.3 Extend `Approval`

Generalize beyond recommendation-only:

```prisma
enum ApprovalType {
  RECOMMENDATION
  AGENT_HIRE
  AGENT_ACTION
  ORCHESTRATION_PLAN
}

// New fields:
//   type               ApprovalType @default(RECOMMENDATION)
//   requestedByAgentId String?
//   payloadJson        String       @default("{}")
// recommendationId     String?      // optional when type != RECOMMENDATION
```

Migration strategy: backfill existing rows as `type = RECOMMENDATION` with `recommendationId` set.

---

## 6. API surface

### 6.1 Human / session auth

| Method | Path | Phase | Purpose |
|--------|------|-------|---------|
| GET | `/api/agents` | 5a | List agents + last run summary |
| GET | `/api/agents/[id]` | 5a | Agent detail + run history |
| POST | `/api/agents/[id]/wakeup` | 5a | Manual invoke (`on_demand`) |
| POST | `/api/agents/[id]/pause` | 5a | Pause agent |
| POST | `/api/agents/[id]/resume` | 5a | Resume agent |
| GET | `/api/agents/[id]/runs` | 5a | Heartbeat run list |
| GET | `/api/agents/[id]/runs/[runId]` | 5b | Run detail + logs |
| POST | `/api/agents/hire` | 5e | Lead requests new agent (creates approval) |
| POST | `/api/platform/agents/worker` | 5a | Worker drain (Bearer secret) |

Extend existing:

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/approvals` | After decide → `enqueueWakeup` for `requestedByAgentId` |
| POST | `/api/releases/[id]/assess` | After assess → wake Governance + QA agents |
| Webhook handlers | `api/webhooks/[provider]` | After persist → wake Integration + domain agents |

### 6.2 Agent auth (API key)

| Method | Path | Phase | Purpose |
|--------|------|-------|---------|
| GET | `/api/agents/me` | 5a | Identity, org, permissions, manager chain |
| GET | `/api/agents/me/inbox` | 5b | Pending work items |
| POST | `/api/agents/me/recommendations` | 5b | Create recommendation + optional approval |
| POST | `/api/agents/me/approvals` | 5e | Request hire / action approval |
| POST | `/api/agents/me/work-items/[id]/complete` | 5b | Mark inbox item done |

Mutating agent calls include header `X-Run-Id: {heartbeatRunId}` when executing inside a heartbeat.

Auth: `Authorization: Bearer <agent_api_key>`. Keys shown once at creation; store hash only.

---

## 7. Heartbeat protocol (agent contract)

Document in `docs/agent-heartbeat-protocol.md` (Phase 5a). Summary:

### Step 1 — Identity

```
GET /api/agents/me
Authorization: Bearer <key>
```

### Step 2 — Approval follow-up (if woken for approval)

Context env / payload includes `approvalId`. Read decision; if approved, perform allowed follow-up (e.g. activate hired agent, enrich recommendation).

### Step 3 — Inbox

```
GET /api/agents/me/inbox
```

Returns prioritized work: in-progress items first, then by priority. Work types map to existing entities (release ID, webhook event ID, etc.).

### Step 4 — Execute

Agent uses **allowlisted tools** only (no raw DB access):

| Agent | Tools (lib functions) |
|-------|----------------------|
| QA | `assessReleaseGovernance`, read release/Jira context |
| DevOps | `analyzeDeployment`, `collectOperationalTelemetry`, read Prometheus/Grafana |
| Incident | `correlateIncidentFromTelemetry`, create incident |
| Integration | Parse webhook payload, mark `WebhookEvent` processed |
| Lead | Read org context, create work items, `POST /api/agents/hire`, delegate |

### Step 5 — Write outputs

- Create or update `Recommendation` + `Approval` when human sign-off required.
- Always write `ActivityEvent` + `AuditLog` (`actorType: agent`, `actorId: agentId`).
- Update `AgentRegistry.lastHeartbeatAt`, set status back to `IDLE`.

### Step 6 — Exit

Adapter records `AgentHeartbeatRun` result (summary, token usage, errors).

### Critical rules

- Never auto-execute side effects (Jira push, deploy) without approved `AGENT_ACTION` approval.
- Never bypass org scope.
- Comment / summarize in run log before exiting on partial work.

---

## 8. Adapter layer

### 8.1 Phase 5a: `internal` adapter (default)

Runs agent logic **in the Next.js process**:

```ts
interface AdapterExecutionContext {
  runId: string;
  agent: AgentRegistry;
  wakeup: AgentWakeupRequest;
  organizationId: string;
}

interface AdapterExecutionResult {
  status: "succeeded" | "failed" | "timed_out";
  summary?: string;
  error?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
}
```

Implementation: `src/lib/agent-control-plane/adapters/internal.ts`

- Load system prompt template per `agentType` from `src/lib/agent-control-plane/prompts/`.
- Call OpenAI (BYOK via `OPENAI_API_KEY`) with structured tool definitions.
- Tools wrap existing lib modules (`release-governance.ts`, `telemetry-service.ts`, etc.).
- Fallback to rule-engine when no API key (preserves current behavior).

### 8.2 Phase 5f: `http` adapter

POST to configured webhook URL with run context; external worker phones home via agent API key. Use when moving to LangGraph Cloud or Temporal.

### 8.3 Explicitly not building (v1)

- `process` adapter (spawn Claude Code / shell) — not AIDOS’s use case.
- Plugin marketplace.
- Execution workspaces / git worktrees.

---

## 9. Event → wakeup wiring

| Event | Location to hook | Agent(s) | Idempotency key |
|-------|------------------|----------|-----------------|
| Release created | Release create routes / webhook ingest | QA, Governance | `release:{id}:detected` |
| Release assessed | `api/releases/[id]/assess` | Governance | `release:{id}:assessed` |
| Approval decided | `api/approvals` POST | `requestedByAgentId` | `approval:{id}:{decision}` |
| Telemetry ingested | `telemetry-service.ts` | DevOps, Incident | `telemetry:{orgId}:{correlationId}` |
| Webhook received | `api/webhooks/[provider]` | Integration → domain agents | `webhook:{eventId}` |
| Agent hire approved | Approval handler | New agent + Lead | `hire:{agentId}:approved` |
| Timer due | Worker loop | Per agent policy | `timer:{agentId}:{intervalBucket}` |

Integration agent may **fan out**: process webhook → enqueue wakeups for DevOps/Incident based on `eventType`.

---

## 10. UI changes

### 10.1 Agents page (`/agents`) — Phase 5a

Replace static cards with:

- Status badge (`IDLE`, `RUNNING`, `PAUSED`, …)
- Last heartbeat / next timer due
- **Invoke** button → `POST /api/agents/[id]/wakeup`
- **Pause / Resume**
- Link to run history

### 10.2 Run history — Phase 5b

- `/agents/[id]/runs` — table: started, duration, source, reason, status, summary
- Run detail: context snapshot, token usage, error, log excerpt

### 10.3 Approvals page — Phase 5e

- Filter by `ApprovalType`
- **Agent hire** detail: proposed name, role, capabilities, adapter config
- **Agent action** detail: proposed action payload (e.g. Jira push scope)
- Show requesting agent name

### 10.4 Dashboard — Phase 5c

- “Agent activity” strip: recent runs, pending wakeups count
- Optional: pending agent work inbox count for Lead Orchestrator

---

## 11. Environment variables

Add to `.env.example`:

| Variable | Purpose |
|----------|---------|
| `PLATFORM_WORKER_SECRET` | Already exists — reuse for agent worker |
| `OPENAI_API_KEY` | BYOK for internal adapter (optional; rule-engine fallback) |
| `AGENT_WORKER_ENABLED` | `true`/`false` — kill switch |
| `AGENT_DEFAULT_HEARTBEAT_SEC` | Default timer interval (e.g. `900`) |

---

## 12. Implementation phases

Each phase has **exit criteria** and **does not start** until the prior phase exit criteria pass (except noted parallel work).

---

### Phase 5a — Control plane skeleton (2–3 weeks)

**Goal:** One agent can be woken, run a heartbeat, and record a run. Approval decisions enqueue wakeups.

#### Backend

| Task | Owner | Paths |
|------|-------|-------|
| Prisma migration: `AgentWakeupRequest`, `AgentHeartbeatRun`, `AgentApiKey` | `/backend` | `prisma/schema.prisma`, `prisma/migrations/` |
| Extend `AgentStatus`, add `runtimeConfigJson`, `lastHeartbeatAt` | `/backend` | `prisma/schema.prisma` |
| `enqueueWakeup` service | `/backend` | `src/lib/agent-control-plane/wakeup.ts` |
| Worker route | `/backend` | `src/app/api/platform/agents/worker/route.ts` |
| `internal` adapter (stub: log + update lastHeartbeatAt) | `/backend` | `src/lib/agent-control-plane/adapters/internal.ts` |
| Agent API key auth middleware | `/backend` | `src/lib/agent-control-plane/agent-auth.ts` |
| `GET /api/agents/me` | `/backend` | `src/app/api/agents/me/route.ts` |
| `POST /api/agents/[id]/wakeup` | `/backend` | `src/app/api/agents/[id]/wakeup/route.ts` |
| Hook approval POST → enqueueWakeup | `/backend` | `src/app/api/approvals/route.ts` |
| Seed default runtime config for existing agents | `/backend` | `src/lib/enterprise-seed.ts` |
| Audit + activity for wakeups and runs | `/backend` | all mutation paths |

#### Frontend

| Task | Owner | Paths |
|------|-------|-------|
| Agents page: status, Invoke, Pause | `/frontend` | `src/app/(platform)/agents/page.tsx` |
| Loading/error states | `/frontend` | same |

#### Docs / ops

| Task | Owner |
|------|-------|
| Document cron setup for worker | this doc §4.4 |
| `docs/agent-heartbeat-protocol.md` (stub) | `/backend` |

#### Exit criteria

- [ ] External cron calls worker; timer wakeup runs for Lead Orchestrator (stub adapter).
- [ ] Manual Invoke from UI creates run row visible in DB.
- [ ] Approving a recommendation enqueues wakeup (visible in `AgentWakeupRequest`).
- [ ] `npm run build` passes.
- [ ] `/architect` review: org isolation on agent routes, no adapter bypass.

---

### Phase 5b — Inbox + specialist execution (2 weeks)

**Goal:** QA agent assesses a release inside a heartbeat; recommendations flow to approval center.

#### Backend

| Task | Owner | Paths |
|------|-------|-------|
| `GET /api/agents/me/inbox` | `/backend` | `src/app/api/agents/me/inbox/route.ts` |
| Inbox builder per agent type | `/backend` | `src/lib/agent-control-plane/inbox.ts` |
| `internal` adapter: OpenAI + tools for QA agent | `/backend` | `adapters/internal.ts`, `prompts/qa.ts` |
| Tool allowlist registry | `/backend` | `src/lib/agent-control-plane/tools/registry.ts` |
| `POST /api/agents/me/recommendations` | `/backend` | creates Recommendation + Approval |
| Hook release assess → enqueueWakeup | `/backend` | `api/releases/[id]/assess/route.ts` |
| Run history API | `/backend` | `api/agents/[id]/runs/route.ts` |
| Rule-engine fallback when no `OPENAI_API_KEY` | `/backend` | adapter |

#### Frontend

| Task | Owner | Paths |
|------|-------|-------|
| Run history list + detail | `/frontend` | `src/app/(platform)/agents/[id]/runs/**` |

#### Exit criteria

- [ ] Release in `DETECTED` appears in QA inbox; heartbeat creates assessment recommendation.
- [ ] Run history shows summary and token usage (or “rule-engine” label).
- [ ] No duplicate recommendations on repeated wakeups (idempotency).
- [ ] Architect review passed.

---

### Phase 5c — Event-driven wakeups (2 weeks)

**Goal:** Webhooks and telemetry ingest wake the right specialists automatically.

#### Backend

| Task | Owner | Paths |
|------|-------|-------|
| Hook webhook handlers → enqueueWakeup | `/backend` | `src/app/api/webhooks/**` |
| Hook `ingestTelemetryForOrganization` → enqueueWakeup | `/backend` | `src/lib/telemetry-service.ts` |
| Integration agent: mark webhook processed | `/backend` | inbox + tools |
| DevOps + Incident agent prompts + tools | `/backend` | `prompts/devops.ts`, `prompts/incident.ts` |
| Fan-out logic (Integration → specialists) | `/backend` | `wakeup.ts` |
| Stuck-run timeout in worker | `/backend` | worker route |

#### Frontend

| Task | Owner | Paths |
|------|-------|-------|
| Dashboard agent activity widget | `/frontend` | `src/app/(platform)/dashboard/page.tsx` |

#### Exit criteria

- [ ] Grafana webhook → DevOps wakeup → recommendation or incident within one worker cycle.
- [ ] Post-deploy telemetry ingest wakes DevOps/Incident agents.
- [ ] Webhook idempotency prevents duplicate runs for same event.
- [ ] Architect review passed.

---

### Phase 5d — Lead orchestrator (2 weeks)

**Goal:** Lead agent delegates to specialists and summarizes org operational state for the human.

#### Backend

| Task | Owner | Paths |
|------|-------|-------|
| Lead system prompt + tools | `/backend` | `prompts/lead.ts` |
| Delegation: create `AgentWorkItem` + enqueueWakeup | `/backend` | `src/lib/agent-control-plane/delegation.ts` |
| Lead inbox: pending approvals, open releases, recent incidents | `/backend` | `inbox.ts` |
| Timer heartbeat for Lead (15 min default) | `/backend` | seed + runtime config |
| Optional: `ORCHESTRATION_PLAN` approval type | `/backend` | schema + handler |

#### Frontend

| Task | Owner | Paths |
|------|-------|-------|
| Lead agent highlighted on `/agents` | `/frontend` | agents page |
| Show delegation trail in run detail | `/frontend` | run detail |

#### Exit criteria

- [ ] Lead heartbeat produces ops summary `ActivityEvent` without creating spurious approvals.
- [ ] Lead can delegate release assess to QA via work item + wakeup.
- [ ] Human can see delegation chain in audit log.
- [ ] Architect review passed.

---

### Phase 5e — Dynamic agent creation (1–2 weeks)

**Goal:** Lead requests new specialist; human approves in approval center; agent becomes active.

#### Backend

| Task | Owner | Paths |
|------|-------|-------|
| Extend `Approval` model (`type`, `payloadJson`, optional `recommendationId`) | `/backend` | migration |
| `POST /api/agents/hire` (agent auth or lead-only) | `/backend` | `api/agents/hire/route.ts` |
| Hire flow: `PENDING_APPROVAL` agent + approval row | `/backend` | hire service |
| On approve: issue API key, status → IDLE, enqueue first wakeup | `/backend` | approval handler |
| On reject: status → TERMINATED | `/backend` | approval handler |
| `permissionsJson.canCreateAgents` on Lead | `/backend` | seed + governance policy |

#### Frontend

| Task | Owner | Paths |
|------|-------|-------|
| Approval UI for `AGENT_HIRE` | `/frontend` | approvals page/components |
| Show custom agents on `/agents` | `/frontend` | agents page |

#### Exit criteria

- [ ] Lead hire request appears in approval center with full payload.
- [ ] Approve → agent runnable via Invoke; reject → agent terminated.
- [ ] Pending agents receive no wakeups and have no API key.
- [ ] Architect review: hire cannot escalate privileges beyond policy.

---

### Phase 5f — Hardening & optional externals (ongoing)

**Goal:** Production readiness; optional external runtime.

| Task | Owner | Notes |
|------|-------|-------|
| `http` adapter | `/backend` | External LangGraph / worker |
| `AGENT_ACTION` approvals (Jira push, etc.) | `/backend` | Post-Accelerator Assist mode |
| Run log retention policy | `/backend` | Prisma cleanup job |
| Token usage rollup per org | `/backend` | Dashboard metrics |
| SSE or poll for live run status | `/frontend` | Nice-to-have |
| PostgreSQL migration validation | `/backend` | Required before prod scale |
| Evaluate Temporal for long-running workflows | `/architect` | Only if heartbeats exceed 5 min regularly |

#### Exit criteria

- [ ] Load test: 10 concurrent orgs, worker drain < 2 min backlog.
- [ ] Security review: API key rotation, revoke path, audit completeness.
- [ ] Documented runbook for stuck runs and worker failures.

---

## 13. File layout (target)

```
src/lib/agent-control-plane/
  wakeup.ts              # enqueueWakeup, coalesce, priority
  worker.ts              # drain queue, timer due, stuck detection
  inbox.ts               # per-agent work queries
  delegation.ts          # lead → specialist
  agent-auth.ts          # Bearer API key validation
  adapters/
    internal.ts
    http.ts                # Phase 5f
    types.ts
  prompts/
    lead.ts
    qa.ts
    devops.ts
    incident.ts
    integration.ts
  tools/
    registry.ts            # allowlist per agent type
    release-tools.ts
    telemetry-tools.ts
    webhook-tools.ts

src/app/api/agents/
  me/route.ts
  me/inbox/route.ts
  me/recommendations/route.ts
  hire/route.ts
  [id]/wakeup/route.ts
  [id]/pause/route.ts
  [id]/runs/route.ts

src/app/api/platform/agents/worker/route.ts
```

---

## 14. Testing strategy

| Layer | Approach |
|-------|----------|
| `enqueueWakeup` | Unit: coalesce, priority, skip paused/pending |
| Worker | Integration: seed agent + wakeup → run row created |
| Agent auth | Unit: valid key, revoked key, wrong org |
| Inbox | Unit: fixture releases/webhooks → correct work items |
| Approval hook | Integration: decide approval → wakeup queued |
| E2E (manual) | Invoke QA agent → recommendation → approve → follow-up wakeup |

Run `npm run build` before marking any phase complete.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Serverless cannot run persistent loop | External cron + worker route (existing pattern) |
| LLM cost | BYOK, rule-engine fallback, log token usage |
| Agent tool overreach | Strict allowlist; no generic SQL |
| Approval schema churn | Generalize with `type` + `payloadJson` in 5e (design now, migrate in 5e) |
| Duplicate webhook processing | `idempotencyKey` on wakeups + `WebhookEvent.status` |
| Scope creep (Paperclip parity) | This doc §2.2 skip list; architect review each phase |

---

## 16. Relationship to other docs

| Doc | Relationship |
|-----|--------------|
| [AGENT-WORKFLOW.md](./AGENT-WORKFLOW.md) | Cursor **development** subagents (`/backend`, `/frontend`) — unrelated to runtime AI agents |
| [MVP-DEVELOPMENT-PLAN.md](./MVP-DEVELOPMENT-PLAN.md) | Accelerator sprints run **in parallel**; agent phases must not block A2/A3 |
| [AIDOS-USP.md](./AIDOS-USP.md) | Positioning: governed operational intelligence |
| [AIDOS-ENTERPRISE-ROADMAP.md](./AIDOS-ENTERPRISE-ROADMAP.md) | Phase 5 umbrella |
| [AIDOS-PHASE-1-EXECUTION.md](./AIDOS-PHASE-1-EXECUTION.md) | Foundation already partially built |

---

## 17. Suggested execution order (Cursor)

```
/orchestrator Implement Phase 5a from docs/ai-agents-workflow.md — freeze API contract first

/backend Phase 5a schema + enqueueWakeup + worker + agent auth

/frontend Phase 5a agents page Invoke/Pause + status

/architect Review Phase 5a tenancy and approval wakeup hook
```

Repeat per phase through 5f.

---

## 18. Summary

| Phase | Delivers |
|-------|----------|
| **5a** | Wakeup queue, worker, stub heartbeat, approval hook, manual invoke |
| **5b** | Inbox, QA agent execution, recommendations, run history |
| **5c** | Webhook/telemetry wakeups, DevOps + Incident agents |
| **5d** | Lead orchestrator, delegation, periodic ops review |
| **5e** | Dynamic agent hire via approval center |
| **5f** | HTTP adapter, action approvals, production hardening |

The minimal viable **governed agent loop** is complete after **Phase 5c**. Phases **5d–5e** deliver the full vision (lead assistant + create specialists). Phase **5f** is production polish and optional external runtimes.

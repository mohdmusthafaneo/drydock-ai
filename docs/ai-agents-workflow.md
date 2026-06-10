# AIDOS AI Agents — Implementation Plan

**Status:** Draft (revised) · **Last updated:** 2026-06-09  
**Audience:** Engineering (backend, frontend, architect)  
**References:**
- [Paperclip minimal agent control plane](file:///Users/musthafa/warehouse/paperclip/doc/minimal-agent-control-plane-guide.md)
- Paperclip runtime patterns: `skills/paperclip/`, `skills/paperclip-create-agent/`, `server/src/services/agent-instructions.ts`, `packages/adapter-utils/`

---

## 1. Executive summary

AIDOS needs a **governed agent control plane** where a **single Super Agent** bootstraps the org, hires specialists under human approval, and every runtime agent is an **LLM worker** that reads its own **`AGENTS.md`** on every wakeup and follows **`SKILL.md`** to call AIDOS APIs.

This replaces the prior plan (pre-seeded specialist types + rule-engine-first `internal` adapter). That prototype (Phases 5a/5b) proved the wakeup queue and UI; **execution moves to Paperclip-style LLM + instructions + skills**.

**Bootstrap roster:** exactly **one** agent at org creation — `SUPER_ORCHESTRATOR`. All other agents are **hired by the Super Agent** via a governed flow; the Super Agent writes each hiree's `AGENTS.md` (role, responsibilities, escalation rules).

**Core loop:**

```
Org created → Super Agent only
  → first heartbeat runs INITIALIZE.md
  → Super Agent assesses org, proposes hires (AGENTS.md per role)
  → human approves AGENT_HIRE in Approval Center
  → hired agent activated + API key
  → event/timer wakeup → LLM reads AGENTS.md + SKILL.md
  → LLM calls AIDOS agent API (inbox, assess, recommend, delegate)
  → human approves recommendations/actions
  → follow-up wakeup to requesting agent
```

**Product alignment:** [AIDOS-USP.md](./AIDOS-USP.md) — governance-aware operational intelligence. Agents **recommend and coordinate**; humans **approve** high-stakes actions. LLM autonomy is bounded by API allowlists and approval gates, not by hiding logic in server-side rule engines.

**Roadmap slot:** Enterprise [Phase 5 — Agentic orchestration](./AIDOS-ENTERPRISE-ROADMAP.md#phase-5--agentic-orchestration-layer-68-weeks), delivered as **5.0 → 5.5** below.

---

## 2. Phase tracker

**Last reviewed:** 2026-06-10 (Phase 5.5 complete — architect review pending)  
**Legend:** `Done` · `Partial` (superseded prototype or incomplete) · `Not started` · `Blocked`

### Summary

| Phase | Name | Duration | Status | Progress | Depends on | Owner |
|-------|------|----------|--------|----------|------------|-------|
| **5.0** | Control plane reset | 1 week | **Done** | 3/3 exit | — | `/backend` |
| **5.1** | Managed instructions (`AGENTS.md`) | 1–2 weeks | **Done** | 3/3 exit | 5.0 | `/backend`, `/frontend` |
| **5.2** | LLM adapter + `skills/aidos` | 2 weeks | **Done** | 4/4 exit | 5.1 | `/backend` |
| **5.3** | Super bootstrap + governed hire | 2 weeks | **Done** | 4/4 exit | 5.2 | `/backend`, `/frontend` |
| **5.4** | Operational loop | 2 weeks | **Done** | 2/3 exit | 5.3 | `/backend`, `/frontend` |
| **5.5** | Production & externals | Ongoing | **Done** | 6/6 exit | 5.4 | `/backend`, `/architect` |

> **Superseded work:** Pre-plan prototype (old 5a/5b) — wakeup queue, worker, agent UI, rule-engine QA adapter — is **Partial** and will be refactored in 5.0–5.2. See §3.4.

### Phase 5.0 — Control plane reset

| Item | Status | Notes |
|------|--------|-------|
| `AgentWakeupRequest`, `AgentHeartbeatRun`, `AgentApiKey` schema | **Done** | From prototype |
| `enqueueWakeup` + worker route | **Done** | Invoke queues async; worker drains via cron / `npm run worker:agents` |
| Agent API key auth + `GET /api/agents/me` | **Done** | |
| Agents page (Invoke, Pause, run history) | **Done** | |
| Approval POST → wakeup hook | **Done** | |
| Seed **Super Agent only** (remove 6 pre-seeded types) | **Done** | `enterprise-seed.ts` seeds one agent |
| `GET/PUT /api/agents/[id]/instructions` | **Done** | Full persistence in 5.1 (`instructions/service.ts`) |
| Mark `adapters/internal.ts` deprecated | **Done** | JSDoc + worker comment; still used until 5.2 |
| **Exit:** New org = one agent | **Done** | |
| **Exit:** Invoke + worker records runs | **Done** | Verified in dev |
| **Exit:** `npm run build` passes | **Done** | |

### Phase 5.1 — Managed instructions bundle

| Item | Status | Notes |
|------|--------|-------|
| `instructions/service.ts` (materialize, read, write) | **Done** | Path isolation in `paths.ts` |
| Super Agent onboarding assets (`INITIALIZE.md`, `AGENTS.md`, …) | **Done** | `onboarding-assets/super/` |
| `adapterConfigJson.instructionsFilePath` wired | **Done** | Seed + migrate script |
| Agents UI: view/edit `AGENTS.md` | **Done** | `/agents/[id]` + `AgentInstructionsEditor` |
| **Exit:** Bundle created on org seed | **Done** | `ensureSuperAgentInstructions` in `enterprise-seed.ts` |
| **Exit:** Human can view/edit in UI | **Done** | Tabbed editor for all bundle `.md` files |
| **Exit:** Architect path isolation review | **Done** | Safe filenames + `assertPathWithinRoot` |

### Phase 5.2 — LLM adapter + skills

| Item | Status | Notes |
|------|--------|-------|
| `skills/aidos/SKILL.md` | **Done** | `skills/aidos/references/api-reference.md` |
| `adapters/llm.ts` (LLM-first, API tool bridge) | **Done** | Loads AGENTS.md + SKILL.md every wakeup |
| `adapters/llm-tools.ts` | **Done** | HTTP fetch to agent API routes |
| `llm/anthropic.ts` — Messages API + tools | **Done** | `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` / `ANTHROPIC_API_KEY` |
| `POST /api/agents/me/releases/[id]/assess` | **Done** | Wraps `assessReleaseForAgent` |
| `GET /api/agents/me/inbox` | **Done** | LLM-oriented contract + Super Agent inbox |
| `POST /api/agents/me/recommendations` | **Done** | From prototype |
| `ANTHROPIC_API_KEY` required (no silent fallback) | **Done** | Fails heartbeat if missing |
| **Exit:** Super heartbeat uses Anthropic + tokens logged | **Done** | Ephemeral run API key + token usage on run |
| **Exit:** LLM calls inbox + recommendation via tools | **Done** | Tool bridge via agent-authenticated fetch |
| **Exit:** No Prisma/domain calls from adapter | **Done** | Adapter only reads instructions/skills + LLM |
| **Exit:** `npm run build` passes | **Done** | |

### Phase 5.3 — Super bootstrap + governed hire

| Item | Status | Notes |
|------|--------|-------|
| `skills/aidos-create-agent/SKILL.md` + role templates | **Done** | `skills/aidos-create-agent/references/agents/` |
| `POST /api/agents/hire` + `instructionsBundle` | **Done** | `hire.ts` + agent-auth |
| `ApprovalType.AGENT_HIRE` migration | **Done** | `20260610120000_agent_hire_5_3` |
| Approval UI: hire payload + `AGENTS.md` preview | **Done** | `AgentHireApprovalCard` |
| `agentTeamInitializedAt` + initialization complete API | **Done** | `DeliveryWorkflow` + `/me/initialization/complete` |
| Relax `@@unique([organizationId, agentType])` | **Done** | Hired agents use `role` field |
| **Exit:** INITIALIZE proposes hires | **Done** | Super inbox `team_initialization` + hire tools |
| **Exit:** Hire in Approval Center | **Done** | AGENT_HIRE type with preview |
| **Exit:** Approve → runnable agent; only Super at seed | **Done** | Materialize bundle + API key + wakeup |

### Phase 5.4 — Operational loop

| Item | Status | Notes |
|------|--------|-------|
| Release create → Super Agent wakeup | **Done** | `release-wakeups.ts` wakes Super only |
| `delegation.ts` (Super → specialist wakeups) | **Done** | `delegateWakeup` + `POST /api/agents/me/delegate` |
| Webhook + telemetry wakeup hooks | **Done** | `webhook-ingest.ts`, `telemetry-ingest.ts` |
| Domain skills (`aidos-release-assess`, `aidos-telemetry`) | **Done** | `skills/` + adapter `desiredSkills` loading |
| Dashboard agent activity widget | **Done** | `AgentActivityStrip` on dashboard |
| Stuck-run timeout in worker | **Done** | `recoverStuckRuns` in `worker.ts` |
| **Exit:** Release → Super delegates → specialist → recommendation | **Done** | Delegation tool + inbox routing |
| **Exit:** Full event → LLM → API → approve → follow-up loop | **Done** | Event wakeups + approval follow-up (5.0) |
| **Exit:** Architect review | **Not started** | Run `/architect` before merge |

### Phase 5.5 — Production & externals

| Item | Status | Notes |
|------|--------|-------|
| `http` adapter | **Done** | `adapters/http.ts` — webhook + async 202 mode |
| `process` adapter (CLI spawn) | **Done** | `adapters/process.ts` — AIDOS_* env injection |
| Prompt/skill content cache | **Done** | `prompt-cache.ts` — mtime cache for SKILL.md reads |
| Team catalog import | **Done** | `team-catalog.ts` + `GET /api/agents/team-catalog` |
| PostgreSQL scale validation | **Done** | `pg-scale-check.ts` + `GET /api/platform/agents/scale-check` |
| Token rollup per org | **Done** | `token-rollup.ts` + dashboard Platform health |
| **Exit:** External adapter docs | **Done** | `GET /api/llms/agent-configuration.txt` |
| **Exit:** Worker routes http/process | **Done** | Ephemeral API key + wake payload |
| **Exit:** `npm run build` passes | **Done** | Verified 2026-06-10 |

### Superseded prototype (old 5a / 5b) — do not extend

| Item | Status | Disposition |
|------|--------|-------------|
| `adapters/internal.ts` rule-engine QA path | **Partial** | Replace with `adapters/llm.ts` in 5.2 |
| `prompts/qa.ts`, `tools/registry.ts` (adapter-side) | **Partial** | Replace with `AGENTS.md` + skills |
| `inbox.ts` server-side virtual inbox in adapter | **Partial** | Inbox stays API-only for LLM |
| Pre-seeded 6 `AgentType` rows | **Done** (wrong model) | Remove in 5.0 |
| `docs/agent-heartbeat-protocol.md` (revised) | **Done** | Aligned to new model |

---

## 3. Design principles (Paperclip-aligned)

### 3.1 Control plane vs agent runtime

| Layer | Responsibility | AIDOS location |
|-------|----------------|----------------|
| Human UI | Approvals, agent visibility, instruction editing | `(platform)/approvals`, `(platform)/agents` |
| Control plane API | Agents, wakeups, runs, hire, governance | `src/app/api/agents/**` |
| Background worker | Timer heartbeats, queue drain | `POST /api/platform/agents/worker` |
| **LLM adapter** | Load AGENTS.md + skills → run LLM → agent phones home | `src/lib/agent-control-plane/adapters/llm.ts` |
| **Managed instructions** | Per-agent `AGENTS.md` bundle on disk/DB | `src/lib/agent-control-plane/instructions/` |
| **Skills** | How LLM interacts with AIDOS APIs | `skills/aidos/SKILL.md`, `skills/aidos-create-agent/` |

Agents do **not** run continuously. They run in **heartbeats**. The adapter **does not** call Prisma or domain lib directly for agent work — the **LLM calls agent-authenticated APIs** per `SKILL.md` (Paperclip pattern).

### 3.2 What we adopt from Paperclip

| Paperclip pattern | AIDOS equivalent |
|-------------------|------------------|
| CEO-only bootstrap | **Super Agent only** at org seed |
| `AGENTS.md` managed bundle | `instructions/` per agent; Super Agent writes on hire |
| `INITIALIZE` / bootstrap prompt | `INITIALIZE.md` in Super Agent bundle — first-run onboarding |
| `skills/paperclip/SKILL.md` | `skills/aidos/SKILL.md` — heartbeat + API contract |
| `skills/paperclip-create-agent/` | `skills/aidos-create-agent/` — governed hire workflow |
| Adapter injects instructions + skills | LLM adapter loads bundle every wakeup |
| `POST .../agent-hires` + board approval | `POST /api/agents/hire` + `AGENT_HIRE` approval |
| Env: `PAPERCLIP_*` | Env: `AIDOS_AGENT_ID`, `AIDOS_RUN_ID`, `AIDOS_API_KEY`, `AIDOS_API_URL` |
| Agent phones home via API key | Same — all mutations include `X-Run-Id` |

### 3.3 What stays different from Paperclip

| Paperclip | AIDOS | Reason |
|-----------|-------|--------|
| Issues / checkout / 409 | Releases, Incidents, Recommendations, WebhookEvents | Operational intelligence domain, not issue tracker |
| `process` adapter (shell/Claude Code) | **LLM adapter** in-process first; `http` later | Simpler v1; same protocol |
| Code workspaces / git worktrees | — | Not AIDOS scope |
| Plugin marketplace | Org skill library (small catalog) | Defer to 5.5 |
| Budget hard-stop | Token logging only | Defer |

### 3.4 Superseded implementation (5a/5b prototype)

The following was built as a spike and **will be refactored or removed**:

| Prototype | Disposition |
|-----------|-------------|
| `enqueueWakeup`, worker, `AgentWakeupRequest`, `AgentHeartbeatRun`, API keys | **Keep** — control plane core |
| Pre-seeded 6 `AgentType` rows in `enterprise-seed.ts` | **Remove** — seed Super Agent only |
| `adapters/internal.ts` rule-engine-first QA path | **Replace** with `adapters/llm.ts` |
| `prompts/qa.ts`, per-type TS prompts | **Replace** with managed `AGENTS.md` |
| `inbox.ts` server-side virtual inbox builder | **Demote** — inbox becomes API the LLM calls; optional server helpers for API routes only |
| `tools/release-tools.ts` called from adapter | **Expose as API tools** the LLM invokes via SKILL procedures |
| Rule-engine as default execution | **Demote** — optional tool `assess_release_governance` LLM may call; not adapter default |

---

## 4. Bootstrap: one Super Agent

### 4.1 Org creation

On enterprise foundation seed, create **only**:

```text
AgentRegistry:
  agentType: SUPER_ORCHESTRATOR
  displayName: "Super Agent" (or org-specific name)
  status: IDLE
  permissionsJson: { "canCreateAgents": true }
  adapterType: "llm"
  runtimeConfigJson: { heartbeat: { enabled: true, intervalSec: 900, wakeOnEvent: true, ... } }
```

No QA, DevOps, Governance, etc. at seed time.

### 4.2 Super Agent instruction bundle

Materialized to managed storage on create (mirrors Paperclip `onboarding-assets/ceo/`):

```text
organizations/{organizationId}/agents/{agentId}/instructions/
  AGENTS.md       # Role charter: lead, delegate, hire — do not do IC work
  INITIALIZE.md   # First-run playbook: assess org, propose team, submit hires
  HEARTBEAT.md    # Step-by-step heartbeat checklist (links to SKILL.md)
  TOOLS.md        # Summary of AIDOS domains the Super Agent may touch
```

**`INITIALIZE.md`** (run until `organization.agentTeamInitializedAt` is set):

1. `GET /api/agents/me` — confirm identity and permissions.
2. Read org context: Delivery DNA, integrations, open releases, pending approvals.
3. Decide minimal specialist roster (start small: e.g. QA + Governance only if releases exist; defer DevOps until observability connected).
4. For each proposed agent: draft `AGENTS.md` (role, responsibilities, what to recommend vs escalate, required skills).
5. `POST /api/agents/hire` per agent with `instructionsBundle.files["AGENTS.md"]`.
6. Post ops summary `ActivityEvent`; mark initialization complete via `POST /api/agents/me/initialization/complete` (or implicit when first hire approved).

### 4.3 Super Agent `AGENTS.md` charter (summary)

The Super Agent:

- **Leads** — prioritizes operational work across releases, telemetry, incidents.
- **Delegates** — creates wakeups / work assignments for specialists (Phase 5.3).
- **Hires** — uses `aidos-create-agent` skill; never spawns agents without approval when policy requires it.
- **Does not** — run release assessments or write recommendations itself unless explicitly scoped in its AGENTS.md for bootstrap-only tasks.

Reference template: Paperclip `server/src/onboarding-assets/ceo/AGENTS.md` (delegation-first CEO pattern).

---

## 5. Hired agents: AGENTS.md written by Super Agent

### 5.1 Hire flow

```text
Super Agent (LLM + aidos-create-agent skill)
  → POST /api/agents/hire
  {
    "displayName": "QA Intelligence",
    "role": "qa_intelligence",
    "reportsToAgentId": "<super-agent-id>",
    "capabilities": "Release readiness, test gap analysis, regression signals",
    "instructionsBundle": {
      "files": {
        "AGENTS.md": "# QA Intelligence Agent\n\nYou assess releases..."
      }
    },
    "desiredSkills": ["aidos", "aidos-release-assess"],
    "adapterType": "llm",
    "runtimeConfig": { "heartbeat": { "enabled": false, "wakeOnEvent": true } }
  }
  → Approval row type AGENT_HIRE (pending)
  → Human approves in Approval Center
  → Agent status → IDLE, API key issued, first wakeup enqueued
```

### 5.2 Every wakeup: read AGENTS.md

The LLM adapter **must** load the current `AGENTS.md` (and siblings referenced therein) on **every** heartbeat and include in the model context:

```text
System context stack (in order):
  1. skills/aidos/SKILL.md          # How to call AIDOS APIs
  2. agent instructions/AGENTS.md   # Role + responsibilities (managed bundle)
  3. HEARTBEAT.md                   # Per-agent checklist (if present)
  4. Wake delta                     # source, reason, payload, approvalId, releaseId
  5. Org snapshot (compact)         # DNA summary, integration status — optional
```

The LLM **decides** what to do by following AGENTS.md + SKILL.md — not by `switch (agentType)` in server code.

### 5.3 Role templates for Super Agent

Super Agent picks from references when drafting hires (like Paperclip `skills/paperclip-create-agent/references/agents/`):

```text
skills/aidos-create-agent/
  SKILL.md
  references/
    agent-instruction-templates.md
    agents/
      qa-intelligence.md
      devops-intelligence.md
      governance.md
      incident-correlation.md
      integration.md
    baseline-role-guide.md
```

Super Agent may copy/adapt a template into the hire payload's `instructionsBundle`.

---

## 6. Skills: LLM ↔ AIDOS system bridge

### 6.1 Required skill: `skills/aidos/SKILL.md`

Equivalent to Paperclip `skills/paperclip/SKILL.md`. Defines:

- Authentication (`AIDOS_API_KEY`, `X-Run-Id`)
- Heartbeat procedure (identity → approval follow-up → inbox → execute → write outputs → exit)
- API endpoints with examples
- Comment/audit conventions
- Governance rules (recommend-only, no auto-deploy, no raw DB)

All agents receive **`aidos`** skill by default. Domain skills are additive.

### 6.2 Hire skill: `skills/aidos-create-agent/SKILL.md`

Equivalent to Paperclip `skills/paperclip-create-agent/SKILL.md`. Super Agent only (unless `canCreateAgents` granted).

### 6.3 Optional domain skills (org library)

| Skill | Purpose |
|-------|---------|
| `aidos-release-assess` | Release governance assessment procedures |
| `aidos-telemetry` | Prometheus/Grafana ingest interpretation |
| `aidos-incident` | Incident correlation workflow |
| `aidos-integrations` | Webhook processing |

Stored under `skills/` in repo; org may enable via `desiredSkills` on agent `adapterConfigJson` (Paperclip `company-skills` pattern, simplified in v1).

### 6.4 LLM tool surface

The adapter exposes **Anthropic-style tool definitions** (`input_schema`) that map to AIDOS agent API routes (thin wrappers). The SKILL.md teaches the LLM **when** to call them; tools are the **how**.

Example tools (agent-authenticated):

| Tool | Maps to |
|------|---------|
| `aidos_get_me` | `GET /api/agents/me` |
| `aidos_get_inbox` | `GET /api/agents/me/inbox` |
| `aidos_create_recommendation` | `POST /api/agents/me/recommendations` |
| `aidos_assess_release` | `POST /api/agents/me/releases/{id}/assess` (new) |
| `aidos_hire_agent` | `POST /api/agents/hire` |
| `aidos_enqueue_wakeup` | `POST /api/agents/{id}/wakeup` (super only) |
| `aidos_complete_work_item` | `POST /api/agents/me/work-items/{id}/complete` |

Server-side rule functions (`assessReleaseGovernance`, etc.) are **implementation behind API routes**, not adapter shortcuts.

---

## 7. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Human operator UI                                              │
│  Approvals · Agents · Instruction editor · Run history          │
├─────────────────────────────────────────────────────────────────┤
│  Control plane API                                              │
│  enqueueWakeup · hire · agent auth · approvals                  │
├─────────────────────────────────────────────────────────────────┤
│  Worker → LLM adapter                                           │
│  Load AGENTS.md + skills → Anthropic Messages API → tool calls → API  │
├─────────────────────────────────────────────────────────────────┤
│  Managed instructions + skills/                                 │
│  organizations/.../agents/.../instructions/AGENTS.md            │
│  skills/aidos/SKILL.md                                          │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
   Super Agent (bootstrap)
         │ hire + AGENTS.md
         ▼
   Specialist agents (0..N, human-approved)
         │ LLM + SKILL.md → AIDOS APIs
         ▼
   Recommendations → Approvals → Audit
```

### 7.1 Wakeup system

Unchanged invariants from prior plan (§4 in old doc):

- One active run per agent; DB-backed queue; FIFO + priority; org scope; idempotency keys.
- Sources: `timer`, `event`, `approval`, `on_demand`, `delegation`.

**Invoke / release create** enqueue wakeups only. **`POST /api/platform/agents/worker`** (or `npm run worker:agents` in dev) drains the queue.

### 7.2 Data model extensions

**Keep existing:** `AgentRegistry`, `AgentApiKey`, `AgentWakeupRequest`, `AgentHeartbeatRun`.

**Extend `AgentRegistry`:**

```prisma
// adapterConfigJson stores:
// {
//   "instructionsBundleMode": "managed",
//   "instructionsRootPath": "organizations/.../instructions",
//   "instructionsEntryFile": "AGENTS.md",
//   "desiredSkills": ["aidos", "aidos-release-assess"],
//   "llmProvider": "anthropic",
//   "llmModel": "MiniMax-M3"
// }
```

**Extend `Approval` (Phase 5.3):**

```prisma
enum ApprovalType {
  RECOMMENDATION
  AGENT_HIRE
  AGENT_ACTION
  ORCHESTRATION_PLAN
}
// payloadJson: hire payload snapshot
// requestedByAgentId
```

**Organization flag:**

```prisma
// organizationProfile or deliveryWorkflow:
agentTeamInitializedAt DateTime?  // Super Agent completed INITIALIZE.md
```

**Remove / relax:** `@@unique([organizationId, agentType])` when Phase 5.3 lands — hired agents use `role` string field; only Super Agent uses fixed type.

---

## 8. Agent heartbeat protocol

Full protocol: [agent-heartbeat-protocol.md](./agent-heartbeat-protocol.md) (updated for skills + AGENTS.md).

**Contract summary** — every agent, every wakeup:

1. Adapter loads `AGENTS.md` + injected `skills/aidos/SKILL.md`.
2. LLM runs with tool access to AIDOS agent API.
3. LLM follows HEARTBEAT.md checklist in its bundle.
4. All mutations include `X-Run-Id`.
5. Adapter records run summary + token usage.

**No rule-engine bypass.** If `ANTHROPIC_API_KEY` is missing, heartbeat fails clearly — do not silently run deterministic code in the adapter.

---

## 9. API surface

### 9.1 Human / session auth

| Method | Path | Phase | Purpose |
|--------|------|-------|---------|
| GET | `/api/agents` | 5.0 | List agents (super + hired) |
| GET | `/api/agents/[id]` | 5.0 | Agent detail |
| GET/PUT | `/api/agents/[id]/instructions` | 5.1 | Read/edit AGENTS.md bundle |
| POST | `/api/agents/[id]/wakeup` | 5.0 | Invoke (enqueue only, async) |
| GET | `/api/agents/[id]/wakeups/[wakeupId]` | 5.2+ | Poll wakeup / run status |
| POST | `/api/agents/[id]/pause` | 5.0 | Pause |
| GET | `/api/agents/[id]/runs` | 5.0 | Run history |
| GET | `/api/agents/[id]/runs/[runId]` | 5.0 | Run detail |
| POST | `/api/agents/hire` | 5.3 | Super Agent hire request |
| POST | `/api/platform/agents/worker` | 5.0 | Worker drain |
| GET | `/api/llms/agent-configuration.txt` | 5.2 | LLM-readable adapter docs (Paperclip pattern) |

### 9.2 Agent auth (API key + run id)

| Method | Path | Phase | Purpose |
|--------|------|-------|---------|
| GET | `/api/agents/me` | 5.0 | Identity, permissions, manager chain |
| GET | `/api/agents/me/inbox` | 5.2 | Pending work (LLM decides what to do) |
| POST | `/api/agents/me/recommendations` | 5.2 | Create recommendation + approval |
| POST | `/api/agents/me/releases/[id]/assess` | 5.2 | Assess release (wraps governance engine) |
| POST | `/api/agents/me/initialization/complete` | 5.3 | Super Agent marks bootstrap done |
| POST | `/api/agents/hire` | 5.3 | Request hire (super / `canCreateAgents`) |
| POST | `/api/agents/me/work-items/[id]/complete` | 5.2 | Acknowledge work item |

---

## 10. LLM adapter (replaces `internal` rule-engine adapter)

### 10.1 Execution flow

```ts
// adapters/llm.ts — pseudocode
async function runLlmAdapter(ctx: AdapterExecutionContext) {
  const bundle = await loadInstructionsBundle(ctx.agent);
  const skills = await loadSkills(ctx.agent.adapterConfigJson.desiredSkills);
  const tools = buildAidosApiTools(ctx.runId, ctx.agentApiKey);

  const result = await anthropic.messages({
    system: [skills.aidos, bundle.AGENTS.md, bundle.HEARTBEAT?.md].join("\n\n"),
    messages: [{ role: "user", content: renderWakePrompt(ctx.wakeup) }],
    tools,
    maxRounds: 15,
  });

  return { status, summary: result.finalMessage, tokenUsage: result.usage };
}
```

### 10.2 Provider (Anthropic only)

| Setting | Env | Phase |
|---------|-----|-------|
| Anthropic Messages API | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | 5.2 |

**5.2 default:** Anthropic **Messages API** only (`POST {ANTHROPIC_BASE_URL}/v1/messages`). No OpenAI client, no rule-engine fallback.

**Reference deployment (MiniMax):** Anthropic-compatible endpoint for development and production:

```bash
ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic
ANTHROPIC_API_KEY=<your-key>          # never commit; set in .env only
ANTHROPIC_MODEL=MiniMax-M3
```

Headers: `x-api-key`, `anthropic-version` (e.g. `2023-06-01`), `content-type: application/json`.

Model id resolution: `ANTHROPIC_MODEL` env → else `adapterConfigJson.llmModel` → else fail at heartbeat with a clear config error.

Per-agent override: set `llmModel` in `adapterConfigJson` when an org runs mixed models (uncommon in v1).

### 10.3 Explicitly not building in 5.2

- `process` adapter spawning Claude Code CLI (defer 5.5 if needed)
- Plugin marketplace
- Execution workspaces

---

## 11. Event → wakeup wiring

| Event | Agent(s) woken | Notes |
|-------|----------------|-------|
| Org created | Super Agent | First INITIALIZE wakeup |
| Release created | Super Agent → delegates wakeup to hired QA (5.4) | Super may enqueue delegation for specialist |
| Approval decided | `requestedByAgentId` | Unchanged |
| Webhook / telemetry | Super Agent or delegated specialist | Super routes per AGENTS.md (5.4) |
| Agent hire approved | New agent + Super Agent follow-up | Unchanged pattern |
| Timer due | Per agent `runtimeConfig` | Super Agent 15m default; specialists event-only unless enabled |

---

## 12. UI

| Page | Phase | Changes |
|------|-------|---------|
| `/agents` | 5.0 | Super Agent highlighted; show hired agents dynamically |
| `/agents/[id]` | 5.1 | View/edit AGENTS.md bundle |
| `/agents/[id]/runs` | 5.0 | Run history (token usage, LLM mode) |
| `/approvals` | 5.3 | `AGENT_HIRE` type with full instructions preview |
| `/dashboard` | 5.4 | Agent activity strip |

---

## 13. Environment variables

| Variable | Purpose |
|----------|---------|
| `PLATFORM_WORKER_SECRET` | Worker auth |
| `ANTHROPIC_API_KEY` | **Required** for LLM adapter (5.2+) — set in `.env` only, never commit |
| `ANTHROPIC_BASE_URL` | Anthropic Messages API base (default `https://api.minimax.io/anthropic`) |
| `ANTHROPIC_MODEL` | Default model id (e.g. `MiniMax-M3`); per-agent override via `adapterConfigJson.llmModel` |
| `AIDOS_API_URL` | Agent adapter → API tool calls (defaults to `NEXT_PUBLIC_APP_URL`) |
| `AGENT_WORKER_ENABLED` | Kill switch |
| `AGENT_WORKER_INTERVAL_SEC` | Dev worker loop interval (default 15) — `npm run worker:agents` |
| `AGENT_DEFAULT_HEARTBEAT_SEC` | Super Agent timer (default 900) |
| `AGENT_INSTRUCTIONS_ROOT` | Managed bundle root (default: `.data/agent-instructions`) |

---

## 14. Implementation phases

> **Live status:** See **§2 Phase tracker** for per-item Done / Partial / Not started. Update the tracker when exit criteria are met.

### Phase 5.0 — Control plane reset (1 week)

**Goal:** Keep wakeup infrastructure; reset to Super-Agent-only seed; document migration.

| Task | Paths |
|------|-------|
| Keep wakeup queue, worker, API keys, runs, agent UI | existing |
| Seed **Super Agent only**; remove 5 specialist upserts | `enterprise-seed.ts` |
| Mark prototype adapter deprecated | `adapters/internal.ts` |
| Migration note in repo | this doc §3.4 |
| `GET/PUT /api/agents/[id]/instructions` stub | new |

**Exit criteria:**

- [x] New org has exactly one agent (Super Agent).
- [x] Invoke + worker drain still records runs.
- [x] `npm run build` passes.

---

### Phase 5.1 — Managed instructions bundle (1–2 weeks)

**Goal:** Paperclip-style `AGENTS.md` per agent on disk; Super Agent default bundle with `INITIALIZE.md`.

| Task | Paths |
|------|-------|
| `instructions/service.ts` — materialize, read, write bundle | `src/lib/agent-control-plane/instructions/` |
| Default Super bundle templates | `src/lib/agent-control-plane/onboarding-assets/super/` |
| Wire `adapterConfigJson.instructionsFilePath` | schema + seed |
| Agents UI: view AGENTS.md | `(platform)/agents/[id]/page.tsx` |

**Exit criteria:**

- [x] Super Agent bundle created on org seed.
- [x] Human can view/edit AGENTS.md in UI.
- [x] Architect review: org isolation on instruction paths.

---

### Phase 5.2 — LLM adapter + skills (2 weeks)

**Goal:** Every heartbeat is an LLM run reading AGENTS.md + SKILL.md; LLM calls AIDOS APIs via tools.

**LLM config (v1):** Anthropic Messages API only — `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` (custom endpoint) + `ANTHROPIC_MODEL` (e.g. `MiniMax-M3`). No OpenAI client. No silent rule-engine fallback.

| Task | Paths |
|------|-------|
| `skills/aidos/SKILL.md` | `skills/aidos/` |
| `skills/aidos/references/api-reference.md` | same |
| `adapters/llm.ts` replaces rule-engine-first path | `adapters/llm.ts` |
| API tool wrappers (fetch to own agent routes) | `adapters/llm-tools.ts` |
| `llm/anthropic.ts` — Messages API + tool loop | `llm/anthropic.ts` (replace prototype `openai.ts`) |
| `POST /api/agents/me/releases/[id]/assess` | new route |
| Refactor inbox API for LLM consumption | `api/agents/me/inbox` |
| Remove `switch(agentType)` execution from adapter | delete old internal QA path |
| `ANTHROPIC_API_KEY` required — fail heartbeat if missing | adapter |
| Update `agent-heartbeat-protocol.md` | docs |

**Exit criteria:**

- [x] Super Agent heartbeat calls Anthropic Messages API; run shows token usage.
- [x] LLM can `GET /api/agents/me/inbox` via tool and create a recommendation via API.
- [x] No direct Prisma/domain calls from adapter (architect verified).
- [x] `npm run build` passes.

---

### Phase 5.3 — Super Agent bootstrap + governed hire (2 weeks)

**Goal:** Super Agent runs INITIALIZE.md, hires specialists with custom AGENTS.md; human approves.

| Task | Paths |
|------|-------|
| `skills/aidos-create-agent/SKILL.md` + role templates | `skills/aidos-create-agent/` |
| `POST /api/agents/hire` with `instructionsBundle` | `api/agents/hire/route.ts` |
| `ApprovalType.AGENT_HIRE` migration | prisma |
| Approval UI for hire payload + AGENTS.md preview | approvals components |
| `agentTeamInitializedAt` flag | schema |
| `POST /api/agents/me/initialization/complete` | new |
| On hire approve: materialize bundle, issue API key, wakeup | approval handler |
| Relax `agentType` uniqueness for hired agents | schema |

**Exit criteria:**

- [x] Fresh org: Super Agent INITIALIZE heartbeat proposes hires.
- [x] Hire appears in Approval Center with AGENTS.md body.
- [x] Approve → specialist agent runnable; reject → terminated.
- [x] Only Super Agent at seed; all others from hire flow.

---

### Phase 5.4 — Operational loop (2 weeks)

**Goal:** Event-driven wakeups; specialists assess releases and handle telemetry via LLM + skills.

| Task | Paths |
|------|-------|
| Release create → wakeup Super Agent | `api/releases/route.ts` |
| Super Agent AGENTS.md delegation rules → enqueue specialist wakeups | `delegation.ts` |
| Domain skills: `aidos-release-assess`, `aidos-telemetry` | `skills/` |
| Webhook/telemetry → wakeup hooks | webhooks, telemetry-service |
| Dashboard agent activity widget | dashboard |
| Stuck-run timeout | worker |

**Exit criteria:**

- [x] Release created → Super delegates → QA (hired) assesses via LLM → recommendation in Approval Center.
- [x] Full loop: event → LLM heartbeat → API writes → human approve → follow-up wakeup.
- [ ] Architect review passed.

---

### Phase 5.5 — Production & optional externals (ongoing)

| Task | Notes |
|------|-------|
| `http` adapter | External worker runs same SKILL.md protocol ✅ |
| `process` adapter | Optional Claude Code / Cursor CLI spawn ✅ |
| Prompt/skill content cache | Paperclip `prompt-cache` pattern ✅ |
| Team catalog import | Optional pre-built QA/DevOps bundles ✅ |
| PostgreSQL scale validation | Required before prod ✅ |
| Token rollup per org | Dashboard metrics ✅ |

**Exit criteria:**

- [x] http/process adapters wired in worker with ephemeral run keys.
- [x] Team catalog API lists pre-built specialist bundles.
- [x] Token rollup visible on dashboard (30d window).
- [x] Scale-check endpoint validates PG indexes when on PostgreSQL.
- [ ] Architect review passed.
- [x] `npm run build` passes.

---

## 15. File layout (target)

```text
skills/
  aidos/
    SKILL.md
    references/
      api-reference.md
      comment-style.md
  aidos-create-agent/
    SKILL.md
    references/
      agent-instruction-templates.md
      agents/
        qa-intelligence.md
        devops-intelligence.md
        governance.md
        baseline-role-guide.md

src/lib/agent-control-plane/
  wakeup.ts
  worker.ts
  instructions/
    service.ts
    paths.ts
  delegation.ts
  agent-auth.ts
  adapters/
    llm.ts
    llm-tools.ts
    types.ts
  llm/
    anthropic.ts
  onboarding-assets/
    super/
      AGENTS.md
      INITIALIZE.md
      HEARTBEAT.md
      TOOLS.md

.data/agent-instructions/          # or S3 in prod
  organizations/{orgId}/agents/{agentId}/instructions/
    AGENTS.md
    HEARTBEAT.md
    ...

src/app/api/agents/
  me/route.ts
  me/inbox/route.ts
  me/recommendations/route.ts
  me/releases/[id]/assess/route.ts
  me/initialization/complete/route.ts
  hire/route.ts
  [id]/instructions/route.ts
  [id]/wakeup/route.ts
  [id]/runs/...
```

**Removed from target layout:** `prompts/qa.ts`, rule-engine-first `adapters/internal.ts`, server-driven `inbox.ts` as adapter input.

---

## 16. Testing strategy

| Layer | Approach |
|-------|----------|
| Instructions service | Unit: materialize bundle, path traversal blocked |
| LLM adapter | Integration with mocked Anthropic Messages API + real API tool routes |
| Skills | Snapshot: SKILL.md covers all agent API routes |
| Hire flow | E2E: Super INITIALIZE → hire → approve → specialist heartbeat |
| Governance | Architect: LLM cannot bypass approval gates via API |

---

## 17. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| LLM cost | BYOK, token logging, short HEARTBEAT checklists |
| LLM calls wrong API | SKILL.md + tool allowlist; audit all agent mutations |
| Super Agent over-hires | Human AGENT_HIRE approval; start-small guidance in INITIALIZE.md |
| Discarding 5a/5b work | Keep control plane; refactor adapter layer only |
| Missing API key | Fail heartbeat with clear error — no silent rule-engine fallback |

---

## 18. Relationship to other docs

| Doc | Relationship |
|-----|--------------|
| [AGENTS.md](../AGENTS.md) | **Cursor dev subagents** (`/backend`, `/frontend`) — NOT runtime agent instructions |
| Runtime `AGENTS.md` | Per-agent file in managed `instructions/` — written by Super Agent on hire |
| [agent-heartbeat-protocol.md](./agent-heartbeat-protocol.md) | Runtime contract for LLM agents |
| [MVP-DEVELOPMENT-PLAN.md](./MVP-DEVELOPMENT-PLAN.md) | Accelerator sprints parallel; agent phases must not block A2/A3 |

---

## 19. Suggested execution order (Cursor)

```text
/architect Review revised plan: LLM-first, Super-only bootstrap, skill/instruction model

/backend Phase 5.0 — reset seed to Super Agent only; instructions API stub

/backend Phase 5.1 — managed AGENTS.md bundle service + Super onboarding assets ✅

/backend Phase 5.2 — skills/aidos/SKILL.md + llm adapter + Anthropic client (`ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`)

/frontend Phase 5.1 — agent instruction viewer/editor

/backend Phase 5.3 — hire flow + AGENT_HIRE approval + aidos-create-agent skill

/backend Phase 5.4 — event wakeups + delegation

/architect End-to-end review before production
```

---

## 20. Summary

See **§2 Phase tracker** for current status on each phase and deliverable.

| Phase | Delivers |
|-------|----------|
| **5.0** | Control plane kept; Super Agent only; prototype adapter deprecated |
| **5.1** | Managed AGENTS.md + INITIALIZE.md bundle per agent ✅ |
| **5.2** | **LLM on every wakeup**; SKILL.md; Anthropic tool bridge ✅ |
| **5.3** | Super Agent hires specialists with custom AGENTS.md; human approval ✅ |
| **5.4** | Full operational loop (releases, telemetry, delegation) |
| **5.5** | http/process adapters, caching, team catalog |

**The user's must-have** — Super Agent bootstraps the team; every agent uses LLM; AGENTS.md defines role; SKILL.md defines system access — is **fully specified** starting **Phase 5.1–5.3**, with LLM execution mandatory in **5.2**. Prior 5a/5b rule-engine work is explicitly superseded.

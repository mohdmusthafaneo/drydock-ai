# Mastra Migration Phase M4 — Governance Review

**Date:** 2026-06-15  
**Scope:** Tenancy, audit trail completeness, approval bypass (M4.3)  
**References:** [migration-plan.md](./migration-plan.md) · [coolify-deploy.md](./coolify-deploy.md)

## Summary

Phase M4 governance review of the Mastra migration (M0–M3 complete). Mastra tools remain thin HTTP clients to org-scoped agent API routes; approval logic stays in existing Prisma-backed routes.

**Verdict:** Approved with notes — safe for production cutover after adapter migration, shared Mastra volume, and load test validation.

---

## Tenancy & isolation

| Check | Status | Notes |
|-------|--------|-------|
| Worker wakeups scoped by `organizationId` | Pass | `drainWakeupQueue` / `enqueueTimerWakeups` filter on org |
| Heartbeat runs created with org | Pass | `agentHeartbeatRun.create({ organizationId, ... })` |
| Ephemeral API keys bound to org + agent | Pass | `createEphemeralRunApiKey(organizationId, agentId, runId)` |
| Mastra tools delegate tenancy to API auth | Pass | `agentFetch` uses Bearer key + `X-Run-Id`; no cross-org IDs in tool context |
| Agent `/me/*` routes filter by `auth.organizationId` | Pass | All routes use `authenticateAgentRequest` + org-scoped Prisma |
| Super-only / role gates at API | Pass | Delegate, close, invite, initialization routes check agent type |
| Chat lib org-scoped | Pass | Threads, messages, approvals, ingress use `{ id, organizationId }` |
| Toolset filtering by agent type + permissions | Pass | `getAidosToolsForAgent` mirrors registry allowlist |
| Instructions loaded per org | Pass | `loadAgentInstructionContext(organizationId, ...)` |
| Mastra LibSQL/DuckDB tenant isolation | Fail | Single shared store per deployment; traces not tagged with `organizationId` |
| Legacy `adapterType: internal` fallback | Resolved (M4.1) | Removed; migration script covers `internal` → `mastra` |

**Recommendation:** Document trace access policy for shared Mastra storage. Consider org metadata on observability spans in a follow-on.

---

## Audit trail

| Path | Status | Notes |
|------|--------|-------|
| `AgentHeartbeatRun.mastraRunId` / `mastraTraceId` | Pass | Schema + migration present |
| Persisted on successful Mastra run | Pass | Flow: `executeAidosAgentRun` → `runMastraAdapter` → worker update |
| Persisted on failed Mastra run | Partial | Catch path may omit trace IDs when Mastra fails early |
| Exposed in run detail API + UI | Pass | Run detail panel shows trace link |
| Heartbeat `AuditLog` entry | Partial | Logged on completion; metadata omits Mastra trace IDs |
| Tool actions (recommend, assess, hire, delegate) | Pass | Existing lib audit paths unchanged |
| Chat lifecycle audit | Pass | `logChatAudit` on create, message, approval, ingress |
| Discovery DNA Mastra enrichment | Partial | LLM workflow run not logged to Prisma when flag enabled |

**Recommendation:** Add `mastraRunId`/`mastraTraceId` to heartbeat `AuditLog.metadataJson`; capture partial IDs on adapter failure when available.

---

## Approval bypass analysis

| Vector | Bypass? | Analysis |
|--------|---------|----------|
| Mastra tool → agent API | No | Same HTTP boundary as legacy; API enforces allowlists |
| Mastra toolset alone | No | Super-only tools stripped; hire requires `canCreateAgents` |
| `aidos_assess_release` | No | Always creates Recommendation + Approval |
| `aidos_hire_agent` | No | Agent `PENDING_APPROVAL` + `AGENT_HIRE` approval |
| `aidos_create_recommendation` with `createApproval: false` | Policy gap | API accepts optional flag; agent could create recommendation without Approval row |
| `discoveryDnaWorkflow` | No | Narrative enrichment only; deterministic DNA unchanged |
| `mvpAcceleratorWorkflow` | No | Suspend steps require session continue with `approved: true` |
| Stolen API key cross-org | No | Key lookup binds agent; mutations scoped to `auth.organizationId` |

**Defense-in-depth:** Tool filtering (Mastra) + route auth + domain service checks (delegate super-only, thread participant, run validation).

**Follow-up:** Enforce `createApproval: true` server-side for agent-authenticated recommendation requests.

---

## Production cutover blockers

| Item | Status |
|------|--------|
| Adapter migration (`internal`/`llm` → `mastra`) | Required — run `scripts/migrate-adapter-type-mastra.ts --apply` |
| Shared Mastra DB volume (web + worker) | Required — see [coolify-deploy.md](./coolify-deploy.md) |
| M4 load test (`npm run load-test:chat-wakeups`) | Required on staging |
| `createApproval: false` agent path | Recommended before enterprise tenants |
| Mastra storage tenant isolation | Recommended — trace data co-mingled, not a functional bypass |

**Not blockers:** Core tenancy model, approval gates on hire/assess/chat, successful-run trace persistence.

---

## Risks & follow-ups

1. LibSQL file locking when web and worker share `/data/mastra` — monitor during load test.
2. Remove legacy `internal` adapter (M4.1) — complete.
3. Update workflow and heartbeat protocol docs (M4.2) — complete.
4. Pass `permissions` consistently to `executeAidosAgentRun` on all chat/heartbeat paths (super hire edge case).

---

*Review per migration-plan M4.3. Inspected worker, Mastra adapter, AIDOS tools, workflows, agent-chat lib, and agent API routes.*

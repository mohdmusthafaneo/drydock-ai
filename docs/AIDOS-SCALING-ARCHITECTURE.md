# AIDOS — Scaling Architecture Proposal

**Status:** Draft for review · **Author:** Architecture (staff-level review) · **Date:** 2026-07-08
**Audience:** Engineering, DevOps, product architecture
**Scope:** Infrastructure and application architecture to support workflows, background refresh/enrich, health checks, AI/ML (code-quality analysis, embeddings), and background agents at scale.

> **TL;DR** — AIDOS is already a well-factored Next.js 16 + PostgreSQL + Mastra system. The single biggest structural risk is that its two async subsystems (the HTTP-polled cron loop and the agent wakeup queue) **cannot be horizontally scaled safely** (no atomic job claim, file-based Mastra storage). This document proposes a **Postgres-first, open-source, cost-conscious** platform: one unified durable job/queue/scheduler runtime (`pg-boss`), `pgvector` for AI/ML, Mastra storage moved off local files into Postgres, a shared cache/coordination layer (Valkey) introduced only when the web tier scales out, first-class health checks + OpenTelemetry, and a tenant-safety data-access layer. It also lists concrete refactoring targets. No premature Kafka/Temporal/Kubernetes.

---

## 1. Method & guiding constraints

This proposal follows the two constraints in the request:

1. **Cost-effective where possible** — prefer squeezing more out of the database and process model we already run before adding new paid infrastructure. Every new component is justified against "can Postgres already do this well enough?"
2. **Open-source where possible** — every recommended component is OSS with a permissive/again-usable license and a credible self-host story.

Two AIDOS invariants are treated as non-negotiable throughout (per `docs/AIDOS-USP.md` and `.cursor/rules/aidos-project.mdc`):

- **Human-governed** — agents recommend/orchestrate; humans approve high-impact actions. No unattended production execution.
- **Tenant isolation** — all data scoped by `organizationId`.

---

## 2. Current-state architecture (as-built)

### 2.1 Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web / API | Next.js 16 (App Router), React 19, TypeScript | 103 route handlers, **0 server actions**, 43 pages |
| Data | **PostgreSQL** via Prisma 7 (`@prisma/adapter-pg` + `pg.Pool`) | 38 models. *(Note: the project rule still says "SQLite" — the schema and runtime are Postgres; the rule text is stale.)* |
| Agent/LLM runtime | Mastra (`@mastra/core` 1.42) | 8 agents, 8 workflows, 17 tools registered in `src/mastra/` |
| Mastra storage | **LibSQL file** (`store.db`) + **DuckDB file** (`observability.duckdb`) on a shared volume | Workflow state + traces |
| Async execution | Two custom loops polling HTTP endpoints (see §2.3) | No scheduler library |
| Deployment | Docker; `web` + `worker` roles on one image; Coolify / compose; Postgres | `docker/entrypoint.sh` branches on `AIDOS_PROCESS_ROLE` |
| Secrets | AES-256-GCM (`token-crypto.ts`) keyed from `AUTH_SECRET`, stored in `Integration.metadataJson` | No KMS/vault |

### 2.2 Request path (mostly DB-first — this is good)

Pages and APIs read from Postgres and from cached sync snapshots kept in `Integration.metadataJson`. Live external calls to GitHub/Jira/Grafana/Prometheus happen only on explicit user actions (Sync, Introspect, Probe), on agent tool calls, or on cron. This read-from-snapshot design is sound and should be preserved.

### 2.3 The two async subsystems (the core of this review)

```text
                        ┌──────────────────────────────────────────┐
   External scheduler   │            web container (Next.js)         │
   (Coolify cron) ─────▶│  POST /api/cron/code-analysis/enrich       │
                        │  POST /api/cron/compliance/eval            │  each handler loops
   scripts/cron-loop.ts │  POST /api/cron/jira/sync | calibrate      │  over ALL orgs
   (dev only) ─────────▶│  POST /api/cron/grafana/sync               │  sequentially,
                        │  POST /api/cron/predictions/eval           │  try/catch per org
                        │  POST /api/cron/executive-briefing/enrich  │
                        └──────────────────────────────────────────┘

   worker container      ┌──────────────────────────────────────────┐
   agent-worker-loop ───▶│  POST /api/cron/agents/worker              │
   (polls every 30s)     │    drainWakeupQueue():                     │
                         │      recoverStuckRuns()                    │
   enqueueWakeup() ─────▶│      enqueueTimerWakeups()                 │
   (poke, fire&forget)   │      SELECT ... WHERE status='queued'      │  ⚠ no atomic claim
                         │      Promise.allSettled(executeRun x5)     │
                         └───────────────┬──────────────────────────┘
                                         ▼
                         AgentWakeupRequest → AgentHeartbeatRun → Mastra adapter
```

**What is good here and must be kept:**

- The **wakeup queue data model** (`AgentWakeupRequest` → `AgentHeartbeatRun`) is genuinely well designed: source priority, idempotency keys, coalescing, stuck-run recovery, per-run token/trace accounting. See `src/lib/agent-control-plane/wakeup.ts` and `worker.ts`.
- **Idempotency** patterns are thoughtful (timer buckets, `chat:{threadId}:{messageId}`, content-hash skip for briefings, dedup keys for findings).
- **Event bridge**: compliance/prediction evals enqueue Super-agent wakeups on new-critical, which then delegates to specialists. Clean.

### 2.4 Gaps that block scaling (evidence-backed)

| # | Gap | Evidence | Impact at scale |
|---|-----|----------|-----------------|
| **G1** | **No atomic job claim.** `executeHeartbeatRun` reads `status === "queued"` then updates in a later transaction. Two workers can grab the same wakeup. | `worker.ts:84-130` | Duplicate agent runs, double LLM spend, double side-effects. **Only safe with exactly one worker** — a hard horizontal-scaling ceiling. |
| **G2** | **Mastra storage is file-based** (LibSQL + DuckDB) on a shared volume, read/written by web *and* worker. | Historical: shared Mastra file volume on web + worker | File-lock contention; cannot run >1 worker or >1 web replica reliably. *(Addressed in Phase 1 via `@mastra/pg`.)* |
| **G3** | **No unified scheduler.** Cron cadence lives in a dev-only Node script (`scripts/cron-loop.ts`) and/or external host cron. No retries, backoff, dead-letter, or visibility for domain jobs. | `scripts/cron-loop.ts` | Missed/duplicated runs, silent failures, no operational insight. |
| **G4** | **Cron handlers iterate all orgs sequentially in one request.** One slow org (or a 30s serverless-style limit) starves the rest; no per-org isolation, no concurrency, no backpressure. | `runScheduled*` in `code-analysis/`, `compliance/`, `predictions/`, `jira-*` | Refresh latency grows linearly with tenant count. |
| **G5** | **In-memory caches** (GitHub installation tokens, prompt cache) are per-process. | `github-app-auth.ts:13`, `prompt-cache.ts` | Break/duplicate work as soon as web runs >1 replica. |
| **G6** | **No health/readiness endpoint** for the app itself; deploy historically used `GET /` as the health check. | Pre-Phase-0 deploy health check | No liveness vs readiness distinction; no dependency (DB/queue/Mastra) checks; poor autoscaling/orchestration signals. |
| **G7** | **JSON stored as `String`**, not native `jsonb`, across ~30 columns (`metadataJson`, `payloadJson`, `snapshotJson`, `normalizedJson`…). | `schema.prisma` throughout | Can't index/query inside JSON; every read pays parse cost; no partial updates. |
| **G8** | **High-volume tables have no partitioning/retention** (`TelemetryEvent`, `TelemetryMetric`, `AgentChatStreamChunk`, `AgentHeartbeatRun`, `WebhookEvent`, `ActivityEvent`, `AuditLog`). | `schema.prisma` | Unbounded growth → slow queries, expensive storage, painful vacuums. |
| **G9** | **Tenant isolation is manual** per query; no middleware/`$extends` safety net. | `org-data.ts`, every route | One missing `where organizationId` = cross-tenant leak. Risk scales with surface area. |
| **G10** | **No shared HTTP client**; each integration re-implements fetch, and only Jira calibration has retry/backoff. No circuit breaker or global rate-limit budget. | `github-api.ts`, `jira-api.ts`, `grafana-api.ts`, `prometheus-api.ts` | Upstream flakiness/rate-limits cascade into user-facing failures. |
| **G11** | **No structured logging / tracing / metrics** (only `console.*` + Mastra's Pino). No env validation. | repo-wide | Hard to debug/observe as concurrency and features grow. |
| **G12** | **God-files** concentrate risk. | `executive-briefing/compose-briefing.ts` (1060), `governance/presentation.ts` (1045), `jira-delivery-health.ts` (913), `jira-api.ts` (907), `jira-sync.ts` (841) | Hard to test, review, and evolve. |

---

## 3. Design principles for the target architecture

1. **Postgres is the platform.** It already holds every durable thing. Add capabilities *to* Postgres (jobs, vectors, time-series) before adding new datastores. This is the single largest cost lever.
2. **One async runtime, not three.** Collapse `cron-loop`, the per-org cron handlers, and the agent wakeup queue onto one durable job system with the same retry/observability/claiming semantics.
3. **Stateless web + stateless workers.** Nothing scale-critical lives in process memory or on local disk. This is what unlocks horizontal scale.
4. **Right tool, right time.** Introduce Valkey/Redis, TimescaleDB, or Temporal only when a concrete threshold is crossed (documented in §11). Avoid paying for scale we don't have yet.
5. **Governance & tenancy are structural, not conventional.** Make tenant scoping and human-approval gates enforced by shared infrastructure, not developer discipline.
6. **Incremental & reversible.** Every phase ships behind a flag, coexists with the old path, and is independently deployable.

---

## 4. Target architecture (overview)

```text
                         ┌───────────────────────────────────────────────┐
                         │                   Clients                       │
                         │        Browser · Slack/Discord · Agent API      │
                         └───────────────┬─────────────────────────────────┘
                                         │ HTTPS
                    ┌────────────────────▼─────────────────────┐
                    │        Web tier  (Next.js, N replicas)     │  stateless
                    │  routes · SSR · SSE · enqueue() jobs        │
                    │  /healthz · /readyz · OTel traces           │
                    └───────┬───────────────────────┬────────────┘
                            │ enqueue / read         │ pub/sub (SSE fanout,
                            │                        │ cache, dist-lock)
        ┌───────────────────▼───────────┐   ┌────────▼─────────┐
        │       PostgreSQL 16            │   │  Valkey (opt.)   │  introduced
        │  ┌──────────────────────────┐ │   │  cache · locks   │  at web scale-out
        │  │ App data (Prisma, jsonb) │ │   │  SSE fanout      │  (Phase 3)
        │  │ pg-boss job/queue/cron   │◀┼───┤                  │
        │  │ pgvector (embeddings)    │ │   └──────────────────┘
        │  │ Mastra storage (@mastra/pg)│ │
        │  │ (Timescale hypertables*)  │ │   * telemetry, Phase 4+
        │  └──────────────────────────┘ │
        └───────────────┬───────────────┘
                        │ SKIP LOCKED claim
     ┌──────────────────┼───────────────────────────────────┐
     │                  │                                     │
┌────▼───────────┐ ┌────▼────────────┐ ┌────────────────┐ ┌─▼───────────────┐
│ Worker: agents │ │ Worker: refresh │ │ Worker: enrich │ │ ML worker (opt.) │
│ (Mastra runs)  │ │ (sync/health)   │ │ (LLM scoring)  │ │ Python: embed,   │
│  N replicas    │ │  N replicas     │ │  N replicas    │ │ code-quality     │
└────────────────┘ └─────────────────┘ └────────────────┘ └──────────────────┘
                                                              via job queue only

   Observability: OpenTelemetry SDK → OTLP → Grafana Tempo/Loki/Prometheus (self-host, OSS)
```

Everything in the Postgres box is **the same database instance** to start (schemas/extensions), which keeps cost and ops minimal. Components split out only when a threshold in §11 is hit.

---

## 5. Component deep-dives

### 5.1 Unified durable job & scheduling layer — **pg-boss**

**Recommendation:** Adopt [`pg-boss`](https://github.com/timgit/pg-boss) as the single job/queue/scheduler runtime. It is a mature, OSS (MIT), Postgres-backed queue that uses `SELECT ... FOR UPDATE SKIP LOCKED` for **safe atomic claims across many workers**, with built-in retries, exponential backoff, dead-letter queues, cron scheduling, rate limiting, debouncing/throttling (singleton keys), and job archival.

**Why pg-boss over the alternatives** (all evaluated):

| Option | License | New infra? | Fit | Verdict |
|--------|---------|-----------|-----|---------|
| **pg-boss** | MIT | **None** (uses existing PG) | Cron + queue + retries + dead-letter + throttle, JS-native | **Chosen** — zero new infra, solves G1/G3/G4 at once |
| Graphile Worker | MIT | None (PG) | Very fast, LISTEN/NOTIFY, lighter cron | Strong runner-up; pg-boss wins on built-in cron + dead-letter ergonomics |
| BullMQ | MIT | **Requires Redis** | Excellent throughput/UX | Defer — adds a paid/managed dependency for throughput we don't yet need |
| Temporal | MIT | **Heavy** (server + workers) | Best-in-class durable workflows | Defer to §5.2 graduation path; too much ops/cost now |
| Keep bespoke queue | — | None | — | Rejected — would still need to build SKIP LOCKED claim, cron, retries, DLQ ourselves |

**What it replaces / absorbs:**

- `scripts/cron-loop.ts` and external Coolify cron → pg-boss **schedules** (cron expressions live in code/DB, survive restarts, no missed ticks).
- The per-org "loop over all orgs in one request" handlers (G4) → a **fan-out** pattern: one scheduled `refresh.fanout` job enqueues one `refresh.org` job per org; workers process them concurrently with per-org isolation, retries, and rate limits.
- The agent wakeup drain's manual selection → pg-boss handles claiming; **the excellent `AgentWakeupRequest` domain model is kept** as the agent-facing API and audit record, with pg-boss as the execution substrate underneath (see §5.1.2).

#### 5.1.1 Fan-out refresh/enrich pattern

```text
pg-boss cron "*/15 * * * *"  →  job: refresh.fanout
  handler: for each active org  →  boss.send('refresh.org', { orgId, provider }, {
                                     singletonKey: `refresh:${orgId}:${provider}`,  // dedup
                                     retryLimit: 5, retryBackoff: true,
                                     expireInMinutes: 10 })

worker pool (refresh queue, teamSize=N)  →  claims refresh.org jobs via SKIP LOCKED
   - one slow/failing org no longer blocks others
   - per-org retry + dead-letter
   - global throttle to respect upstream API rate limits
```

This directly fixes G3 and G4 and gives operators a real queue to watch.

#### 5.1.2 Bridging the agent control plane onto pg-boss (fixes G1 without a rewrite)

Keep `enqueueWakeup()` and the `AgentWakeupRequest` row as the **source of truth and audit trail**. Change only the *drain*:

```ts
// Today (racy): read status==='queued', then update later.
// Target: enqueueWakeup() also sends a pg-boss job carrying the wakeupId.
//         The worker's job handler is the ONLY place that transitions the row,
//         and pg-boss guarantees exactly-one active worker per job via SKIP LOCKED.

await boss.send('agent.wakeup', { wakeupId }, {
  singletonKey: `wakeup:${wakeupId}`,   // idempotent enqueue
  priority: WAKEUP_SOURCE_PRIORITY[source],
  retryLimit: 2,
});

// handler:
boss.work('agent.wakeup', { teamSize: AGENT_WORKER_CONCURRENCY }, async ([job]) => {
  await executeHeartbeatRun(job.data.wakeupId); // unchanged internals
});
```

Result: multiple worker replicas become safe; `AGENT_WORKER_CONCURRENCY` becomes real cluster-wide parallelism; the poke path (`worker-poke.ts`) becomes a `boss.send` instead of a fire-and-forget HTTP POST; timer wakeups become a pg-boss schedule. `recoverStuckRuns` remains as a safety net but pg-boss's own expiry/retry handles most cases.

**Migration note:** run pg-boss in its own Postgres schema (`pgboss`) so it never collides with Prisma migrations.

### 5.2 Durable, multi-step workflows

Two distinct workflow needs exist; keep them separate:

1. **LLM/agent reasoning workflows** → **stay on Mastra** (`heartbeatWorkflow`, `discoveryDnaWorkflow`, `jiraCalibrationWorkflow`, `executiveBriefingEnrichWorkflow`, etc.). Mastra is the right home for tool-calling, streaming, and traces. The only change is storage (§5.5).
2. **Data pipelines / sagas** (fetch → normalize → score → persist → correlate → maybe-wake-agent) → model as **job chains on pg-boss**: each step is a job that, on success, enqueues the next, with per-step retries and a compensation job on failure. This is cheaper and simpler than a workflow server and reuses the queue we're already adding.

**Graduation path (documented, not built now):** if/when pipelines need long timers (days), human-in-the-loop waits spanning restarts, signals, or complex compensation across many steps, adopt **Temporal** (OSS, self-hostable) for those specific workflows. Trigger to revisit: >~10 distinct multi-step pipelines or any workflow needing durable timers > 1 hour with mid-flight versioning. Until then, job chains are sufficient and free.

### 5.3 AI/ML subsystem — code-quality analysis, embeddings, background AI

This is the growth area (the [Sprint Ticket ↔ Commit Evidence RFC](./sprint-ticket-commit-evidence.md) is the first instance) and the RFC already assumes vector search. Concrete architecture:

**Vector store → `pgvector` (OSS) in the existing Postgres.** No Pinecone/Weaviate/Qdrant bill, no new datastore, and the RFC explicitly lists pgvector as the natural fit. Store 384-dim embeddings as `vector(384)`; top-K via `ORDER BY embedding <=> $1 LIMIT k` with an HNSW index. Every vector row carries `organizationId`; every query filters on it (G9 safety layer applies here too).

**Embedding & code-quality compute → a dedicated worker, off the request path.** Two viable engines:

| Engine | Language | Cost | When |
|--------|----------|------|------|
| **`fastembed`/Transformers.js** (ONNX, in-Node) | JS | Free, no extra service | Default — keeps it JS-native (matches team skillset), runs `all-MiniLM-L6-v2` in the enrich worker |
| **Python sidecar** (`sentence-transformers`/FastAPI) | Python | Free; one small container | When models get heavier (BGE, CodeT5+) or need GPU/MPS batching per RFC §4.4 |

Recommendation: start with the **in-Node ONNX** path (no new service, cheapest), and keep the interface behind an `EmbeddingService` so swapping to a Python/GPU sidecar later is a config change, not a rewrite. All embedding/analysis work is dispatched through pg-boss (`ml.embed`, `ml.codeQuality`) so it inherits retries, batching, throttling, and horizontal scale, and never blocks a user request.

**Cost controls for LLM-heavy features** (code-quality scoring, enrich, briefings): centralize model calls behind one client with (a) a per-org token/spend budget, (b) content-hash caching so unchanged inputs don't re-spend (the briefing `factsHash` pattern, generalized), (c) cheap-model routing for bulk scoring, and (d) a kill-switch flag per feature. This turns "background AI" from an unbounded cost into a metered, observable line item.

**Data model** for the ML subsystem follows the RFC's proposal (`Embedding`, `CommitSnapshot`, `TicketSnapshot`, `EvidenceLink`, `EvidenceReview`) — adopt it, but as native Prisma models with `jsonb` and `vector` columns, and route its jobs through pg-boss (`EvidenceJob` becomes an `evidence.recompute` queue).

### 5.4 Health checks & self-observability (fixes G6, G11)

Add first-class endpoints and telemetry:

- **`GET /healthz`** — liveness: process is up. No dependency checks. For orchestrator restarts.
- **`GET /readyz`** — readiness: checks DB connectivity, pg-boss reachable, Mastra store reachable, migrations applied. Gates traffic/rollout.
- **`GET /api/internal/health`** (worker-secret auth) — deep status: queue depths per queue, oldest queued job age, stuck-run count, last successful run per scheduled job, integration sync staleness. This becomes the operator dashboard's data source and complements the existing `/api/integrations/health` (which is customer-integration health, a different concern — keep it).
- **OpenTelemetry** SDK (OSS) for traces + metrics, OTLP-exported to **Grafana Tempo/Loki/Prometheus** — a stack the team already integrates with for customers, so no new vendor. Add **pino** as the one structured logger (replace `console.*`), with request/job/run correlation IDs so a chat message → wakeup → Mastra run → tool call → external API is one trace.

`AgentHeartbeatRun` already records `mastraTraceId`; wiring OTel makes those traces first-class and cross-service.

### 5.5 Mastra storage migration (fixes G2 — highest-leverage change)

Move Mastra off local files:

- LibSQL `store.db` → **`@mastra/pg`** (Postgres) for workflow/agent state.
- DuckDB observability → either the Postgres observability store or an OTel exporter to Tempo (preferred, per §5.4).

This removes the shared-volume file-lock ceiling and lets **both web and worker scale to N replicas**. It also consolidates backups (one Postgres backup covers everything) and deletes the `/data/mastra` volume + the `chown` dance in `entrypoint.sh`. This is the change that most directly unblocks horizontal scaling and should be sequenced early.

### 5.6 Shared cache & coordination — **Valkey**, introduced at web scale-out (fixes G5)

While the web tier is a single replica, in-memory caches are fine. The moment we run **>1 web replica** we need shared state for: GitHub token cache, prompt cache, rate-limit counters, SSE fan-out (so a stream started on replica A survives a poke handled on replica B), and lightweight distributed locks.

**Recommendation:** [Valkey](https://valkey.io) (the OSS, BSD-licensed Redis fork; drop-in `redis`-protocol) — avoids the Redis licensing shift, and is what most managed "Redis" is moving to. Keep usage minimal and behind a `CacheClient` interface with an in-memory fallback so single-replica dev needs nothing.

**Cost note:** do *not* add Valkey to run the job queue (pg-boss covers that on Postgres). Add it only for cache/coordination/SSE fan-out when horizontal web scale demands it. This keeps small deployments at "just Postgres."

### 5.7 Data model evolution (fixes G7, G8)

- **`String` JSON → `jsonb`.** Migrate the ~30 `*Json` columns to native `Json` (Prisma `Json` → Postgres `jsonb`). Enables GIN indexes, in-DB filtering (e.g., query telemetry by `normalizedJson->>'service'`), partial updates, and drops per-read parse cost. Do it column-by-column behind a compatibility shim.
- **Time-series partitioning + retention.** For `TelemetryEvent`, `TelemetryMetric`, `AgentChatStreamChunk`, `AgentHeartbeatRun`, `WebhookEvent`, `ActivityEvent`, `AuditLog`: add native **declarative range partitioning by time** + a pg-boss retention job that drops old partitions. This keeps hot tables small and vacuum cheap.
- **TimescaleDB (OSS)** — only if telemetry volume warrants continuous aggregates / compression. It's a Postgres extension, so it stays "just Postgres." Threshold: sustained telemetry ingest that makes plain partitioning painful (see §11). Not needed for launch.

### 5.8 Multi-tenant safety layer (fixes G9)

Replace per-query discipline with structural enforcement:

- Introduce a **tenant-scoped Prisma client** via `$extends` (Prisma client extensions): given an `organizationId`, it auto-injects `where: { organizationId }` on find/update/delete and sets it on create for tenant-owned models. Routes obtain it from the session; agents from their API-key org. Global/unscoped access requires an explicit `prisma.asSystem()` escape hatch used only by cron fan-out.
- Optionally add **Postgres Row-Level Security** as defense-in-depth later (set `app.current_org` per transaction). Extension-level is enough to start and needs no schema change.

This turns G9 from "every developer must remember" into "you have to try hard to leak," which is the right posture as the API surface and team grow.

### 5.9 Unified integration HTTP client (fixes G10)

Create one `httpClient` wrapper used by all integration modules with: timeouts (already in Grafana/Prometheus), **exponential backoff with jitter on 429/5xx**, a **circuit breaker** per (org, provider), a **token-bucket rate limiter** per provider to stay under GitHub/Jira limits, and standardized error mapping into the existing `*ApiError` classes. Consolidates duplicated fetch logic and makes upstream flakiness a contained, observable event instead of a user-facing 500.

---

## 6. Refactoring register (existing codebase)

Ordered by leverage. These are independent of the new infra and pay off immediately.

| Area | Action | Files | Why |
|------|--------|-------|-----|
| **Env validation** | Add `src/lib/env.ts` (zod schema, parsed once, typed export). Replace inline `process.env.*`. | repo-wide | Fail fast on misconfig; kills a class of prod incidents; documents required vars in one place. |
| **Structured logging** | Introduce `pino` logger + request/job correlation IDs; replace `console.*`. | repo-wide | Precondition for observability (§5.4). |
| **Tenant-safe data access** | `$extends` client (§5.8). | `prisma.ts`, routes | Structural tenant isolation. |
| **Shared HTTP client** | `src/lib/http/client.ts` (§5.9); refactor integrations onto it. | `github-api.ts`, `jira-api.ts`, `grafana-api.ts`, `prometheus-api.ts` | Resilience + dedup. |
| **Break up god-files** | Split by responsibility (fetch vs transform vs present). | `executive-briefing/compose-briefing.ts` (1060), `governance/presentation.ts` (1045), `jira-delivery-health.ts` (913), `jira-api.ts` (907), `jira-sync.ts` (841) | Testability, review speed, blast-radius. |
| **Consolidate async runtime** | Delete `scripts/cron-loop.ts` cadence logic; move to pg-boss schedules; convert per-org loops to fan-out. | `scripts/`, `src/lib/**/scheduled-*.ts` | Removes G3/G4. |
| **Move `tmp/*.py` one-offs into the product** | Promote the Sprint-Evidence pipeline into `src/lib/evidence/` + `ml.*` jobs per RFC §5.1. | the previous sprint-evidence one-off pipeline | Turns a proven one-off into a maintained feature; removes secret-leak-prone scratch scripts from the tree. |
| **LLM cost governor** | One metered client with budgets + hash-cache + kill-switch (§5.3). | `agent-control-plane/llm/`, `*/enrich*.ts` | Makes background AI affordable and safe. |
| **Retire dual DB adapters** | The tree carries both `@prisma/adapter-pg` and `@prisma/adapter-better-sqlite3`; standardize on Postgres and drop SQLite paths (and fix the stale "SQLite" project rule). | `package.json`, `.cursor/rules/aidos-project.mdc` | Removes ambiguity; one supported DB. |

---

## 7. Recommended technology choices (summary)

| Need | Recommendation | License | Adds infra? | Alternatives considered |
|------|---------------|---------|-------------|--------------------------|
| Job queue + scheduler + retries + DLQ | **pg-boss** | MIT | No (Postgres) | Graphile Worker; BullMQ (needs Redis); bespoke |
| Durable LLM/agent workflows | **Mastra** (keep) | — | No | — |
| Durable data pipelines | **pg-boss job chains** | MIT | No | Temporal (deferred) |
| Vector search / embeddings store | **pgvector** | PostgreSQL | No (extension) | Qdrant/Weaviate/Pinecone (cost) |
| Embedding compute | **fastembed/Transformers.js (ONNX)** → Python sidecar later | Apache/MIT | No → 1 small container | Hosted embedding APIs (cost/PII) |
| Mastra state storage | **@mastra/pg** | — | No (Postgres) | LibSQL file (current, blocks scale) |
| Cache / locks / SSE fan-out | **Valkey** (only at web scale-out) | BSD | Yes, deferred | Redis (license), Postgres LISTEN/NOTIFY (limited) |
| Time-series (if needed) | **TimescaleDB** | Apache (community) | No (extension) | Plain partitioning (default) |
| Telemetry/traces/logs | **OpenTelemetry + Grafana Tempo/Loki/Prometheus** | Apache | Yes (self-host OSS) | Datadog/New Relic (cost) |
| App logging | **pino** | MIT | No | winston |
| Config validation | **zod** (already a dep) | MIT | No | — |

Net new *always-on* infrastructure to reach safe horizontal scale: **zero** (everything rides the existing Postgres). Valkey and the observability stack are the only additions, and both are deferred to explicit thresholds.

---

## 8. Reference deployment topology (target)

```text
                 ┌────────────┐
   Internet ────▶│  Reverse    │
                 │  proxy /    │
                 │  Coolify    │
                 └──────┬──────┘
                        │
        ┌───────────────┼────────────────┐
        │               │                │
   ┌────▼────┐     ┌────▼────┐      (autoscale on
   │ web #1  │ ... │ web #N  │       CPU / queue depth)
   └────┬────┘     └────┬────┘
        └───────┬───────┘
                │ enqueue / query
        ┌───────▼──────────────────────────┐
        │  PostgreSQL 16  (+ pgvector,       │  managed or Coolify;
        │  pg-boss schema, @mastra/pg,       │  primary + read-replica later
        │  jsonb, partitions)                │
        └───────┬──────────────────────────┘
                │ SKIP LOCKED
   ┌────────────┼─────────────┬───────────────┐
   │            │             │               │
┌──▼──────┐ ┌───▼───────┐ ┌───▼────────┐ ┌────▼───────┐
│worker:  │ │worker:    │ │worker:     │ │ml worker   │
│agents   │ │refresh    │ │enrich      │ │(optional)  │
└─────────┘ └───────────┘ └────────────┘ └────────────┘

   (Valkey + Grafana LGTM added at Phase 3/4 thresholds)
```

Worker roles become **queues**, not containers: one image, `AIDOS_PROCESS_ROLE=worker` with a `WORKER_QUEUES` env selecting which pg-boss queues it serves. Small deployments run one worker serving all queues; large ones run dedicated pools. This keeps the current simple ops model while enabling scale.

---

## 9. How the target maps to upcoming features

| Upcoming feature | Lands on |
|------------------|----------|
| **Workflows** | Mastra (LLM) + pg-boss job chains (data); durable, retriable, observable |
| **Background refresh** | pg-boss cron → fan-out `refresh.org` jobs; shared HTTP client; per-org isolation |
| **Enrich** | `enrich.*` queue; LLM cost governor + hash-cache; horizontal enrich workers |
| **Health checks** | `/healthz`, `/readyz`, `/api/internal/health`; OTel; queue-depth alerts |
| **AI/ML code-quality analysis** | `ml.codeQuality` jobs; pgvector; embedding worker; Evidence RFC becomes `src/lib/evidence/` |
| **Background agents** | Existing control plane on pg-boss substrate (safe multi-worker); Mastra on Postgres |

---

## 10. Phased migration plan

Each phase is independently shippable, flag-gated, and reversible. Ordering front-loads the changes that unblock horizontal scale (G1, G2, G3).

| Phase | Theme | Key work | Exit criteria |
|-------|-------|----------|---------------|
| **0** | Foundations (no behavior change) | `env.ts` (zod), `pino` logger + correlation IDs, `/healthz` + `/readyz`, OTel skeleton | Structured logs + health endpoints in prod; env validated at boot |
| **1** | Unblock scale | Mastra → `@mastra/pg` (§5.5); add pg-boss (own schema); bridge agent wakeups onto pg-boss with SKIP LOCKED (§5.1.2) | Two workers run concurrently with **zero duplicate runs**; `/data/mastra` volume retired |
| **2** | Unify async | Move all domain cron to pg-boss schedules; convert per-org loops to fan-out; delete `cron-loop.ts` cadence; shared HTTP client (§5.9) | One slow org can't delay others; retries + DLQ visible; upstream 429s handled |
| **3** | Scale web + data hygiene | Valkey cache/locks/SSE fan-out; `String`→`jsonb` migrations; tenant-safe `$extends` client | N web replicas serve traffic safely; JSON queryable; tenant scoping structural |
| **4** | AI/ML platform | pgvector + `Embedding` model; embedding worker (`ml.*`); promote Evidence RFC to `src/lib/evidence/`; LLM cost governor | First AI/ML feature (Sprint Evidence) runs as a scheduled, metered, multi-worker job |
| **5** | Volume & maturity | Partitioning + retention jobs; (TimescaleDB if warranted); read-replica for analytics; deep `/api/internal/health` dashboard | Hot tables bounded; analytics off primary; queue SLOs alerting |
| **6 (optional)** | Advanced workflows | Temporal for any pipeline exceeding job-chain limits | Only if §11 thresholds hit |

Refactors from §6 (god-files, one-offs cleanup) are woven through phases where they touch the same code.

---

## 11. Thresholds for deferred components (avoid premature cost)

| Component | Add it when… |
|-----------|--------------|
| **Valkey/Redis** | web tier runs >1 replica, OR SSE fan-out crosses replicas, OR you need cross-instance rate limits/locks |
| **BullMQ** | pg-boss throughput becomes a bottleneck (sustained >~1–2k jobs/sec) and you already run Redis |
| **Temporal** | >~10 multi-step pipelines, OR durable timers >1h, OR human-in-loop waits spanning restarts with mid-flight versioning |
| **TimescaleDB** | telemetry ingest makes plain partitioning/vacuum painful; you want continuous aggregates/compression |
| **Read replica** | analytics/reporting queries contend with OLTP; dashboards slow under load |
| **Separate Postgres for vectors** | embedding volume/HNSW build competes with OLTP for memory/CPU |
| **Kubernetes** | Coolify/compose can't express your autoscaling/rollout needs; multi-region |

---

## 12. Risks & trade-offs

- **pg-boss couples jobs to Postgres load.** Mitigation: it's tunable (poll interval, batch size), archives completed jobs, and lives in its own schema; move to BullMQ/Redis only at the throughput threshold above. For AIDOS's job profile (periodic refresh/enrich + bursty agent wakeups) this is comfortably within pg-boss's envelope.
- **Postgres becomes more central** (app + jobs + vectors + Mastra). Mitigation: this is deliberate (cost/simplicity); connection pooling (PgBouncer) and a read replica are the pressure-release valves before splitting datastores.
- **Migration risk on the agent queue.** Mitigation: bridge, don't rewrite — the `AgentWakeupRequest` model and `executeHeartbeatRun` internals are unchanged; only claim/scheduling moves. Ship behind a flag with the old drain as fallback.
- **`String`→`jsonb` migrations touch many columns.** Mitigation: one column at a time, dual-read shim, backfill in a pg-boss job.
- **In-Node embeddings use worker CPU/RAM.** Mitigation: cap batch sizes, isolate on the ML worker pool, and the `EmbeddingService` interface allows moving to a Python/GPU sidecar without touching callers.

---

## 13. What we explicitly are *not* doing (and why)

- **No Kafka / event-streaming platform** — Postgres + pg-boss covers the eventing we have; Kafka is ops/cost overkill until multi-consumer, high-throughput streaming is a real requirement.
- **No microservice split of the Next.js monolith** — the modular monolith with role-based workers scales well and keeps the team fast; split only along the ML/Python boundary if needed.
- **No managed vector DB** — pgvector meets the RFC's needs at zero added cost.
- **No unattended automation** — unchanged AIDOS invariant; all new pipelines still terminate at human approval for high-impact actions.

---

## 14. Immediate next steps (first PR-sized chunks)

1. Add `src/lib/env.ts` (zod) + `src/lib/logger.ts` (pino) and thread a correlation ID through one route→wakeup→run path as the pattern. *(Phase 0)*
2. Add `/healthz` and `/readyz`. *(Phase 0)*
3. Spike `@mastra/pg` on staging; validate traces/state parity; retire the file volume. *(Phase 1)*
4. Introduce pg-boss (schema `pgboss`), port **one** scheduled job (`grafana.sync`) end-to-end as the reference implementation, then the agent-wakeup bridge. *(Phase 1)*
5. Draft the `Embedding`/`EvidenceLink` Prisma models with `vector`/`jsonb` and stand up the `ml.embed` queue with an in-Node ONNX embedder, proving the Sprint-Evidence RFC on real data. *(pre-Phase 4 spike)*

---

## 15. Related documents

- [`sprint-ticket-commit-evidence.md`](./sprint-ticket-commit-evidence.md) — the first AI/ML feature this platform must host; §5.3 here supersedes its infra open-questions (pgvector, job scheduling).
- [`AIDOS-ENTERPRISE-ROADMAP.md`](./AIDOS-ENTERPRISE-ROADMAP.md) — this proposal is the concrete, cost-first realization of the roadmap's "Recommended technology stack" (it swaps FastAPI/Temporal/Redis-by-default for a Postgres-first path with documented graduation thresholds).
- [`AIDOS-USP.md`](./AIDOS-USP.md) — governance/human-in-the-loop invariants preserved throughout.
- `AGENTS.md` — Mastra registration rules; unchanged (agents/workflows/tools still register in `src/mastra/index.ts`).
- `.github/workflows/docker.yml` — builds app + ML inference images to GHCR.

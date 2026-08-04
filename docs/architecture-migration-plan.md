# AIDOS — Architecture Migration Plan (Final)

**Status:** Approved direction · **Date:** 2026-07-09  
**Progress tracker:** [`architecture-migration-tracker.md`](./architecture-migration-tracker.md)  
**Companion doc:** [`AIDOS-SCALING-ARCHITECTURE.md`](./AIDOS-SCALING-ARCHITECTURE.md) (analysis & rationale)
**This doc:** the concrete, decision-locked, phased execution plan.

> This plan reflects decisions made after review of the scaling proposal. It is **Postgres-first, open-source, and cost-conscious**: no new always-on infrastructure is required to unblock the first phases. Valkey and the self-hosted observability stack are explicitly deferred behind documented triggers.

---

## 1. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **pg-boss** is the single job queue + scheduler (runs in existing Postgres). | Atomic `SKIP LOCKED` claim, cron, retries, DLQ, throttling — zero new infra. |
| D2 | **Mastra storage → Postgres** via `@mastra/pg`. **DuckDB removed.** | Unblocks multi-process/replica; one datastore; no extra stack. |
| D3 | Drop the `/data/mastra` Docker volume + `chown` steps once D2 lands. | No longer needed; simpler ops. |
| D4 | **Phase 1 runs one web process + one worker process.** No Valkey yet. | Cost/simplicity; in-memory caches are safe with a single process each. |
| D5 | Workers stay in the **same repo (modular monolith)**, run as **process roles** selected by env (`WORKER_QUEUES`). | Shared `src/lib` logic; one image; independent scaling via replicas. |
| D6 | **ML/embeddings = separate Python service** (stateless inference), orchestrated by a Node `ml` worker via pg-boss. | Model is swappable behind an HTTP contract without touching orchestration. |
| D7 | **pgvector** is the vector store (Postgres extension), tenant-scoped by `organizationId`. | No managed vector DB; native to `@mastra/pg`. |
| D8 | **TimescaleDB** (Postgres extension) for high-volume telemetry tables. | Partitioning, compression, retention — still "just Postgres." |
| D9 | Credential handling differs per provider: **GitHub** mint-and-cache; **GitLab/Bitbucket** rotating-refresh with **single-flight via Postgres advisory lock**. | Verified provider behavior (see §2); avoids refresh-token invalidation races without Valkey. |
| D10 | **Valkey** is deferred until the web tier runs **>1 replica** (shared cache, SSE fan-out, cross-replica locks). | Not required at current scale. |
| D11 | **Local-first validation** — prove each phase with the same Docker images + env model used in production (`Dockerfile` web/worker roles + Postgres). | Same image and env model as production; no platform-specific deploy coupling. |

---

## 2. Credential & token handling (verified provider behavior)

Source of truth for all three, confirmed against current provider docs (2026):

| Provider | Access token TTL | Refresh model | What we store | Concurrency hazard | Our handling |
|----------|------------------|---------------|---------------|--------------------|--------------|
| **GitHub App** (current) | **1 hour** | No refresh token; **mint from App JWT** on demand. Minting a new token does **not** invalidate old tokens; multiple can coexist. Token creation is rate-limited; new tokens share the installation's total API quota. | Installation ID (DB) + App private key (env). Short-lived token cached, **not** required in DB. | None for correctness (extra mints only waste rate limit). | **Mint + cache until ~5 min before expiry.** Cache is an optimization. Phase 1: in-memory. Multi-replica: shared cache (Valkey) to cut redundant mints. |
| **GitLab OAuth** | **2 hours** (fixed) | **Mandatory rotating refresh tokens** — refresh invalidates **both** old access **and** old refresh token, returns a new pair. Must persist new refresh token or `invalid_grant`. | Encrypted access + refresh token in DB (`Integration.metadataJson`). | **High** — concurrent refresh kills the integration. | **Single-flight refresh + persist-after-refresh.** Serialize with **Postgres advisory lock** keyed by `(orgId, provider)`. No Valkey needed. |
| **Bitbucket Cloud OAuth** | **2 hours** | **Rotating refresh tokens** (enforced 2026-05-04); unused refresh tokens expire after 3 months. Same rotate-and-persist requirement. | Same as GitLab. | **High** — same as GitLab. | Same as GitLab: **single-flight + persist**, advisory-lock serialized. |

### 2.1 Shared credential-resolution contract

Introduce one interface so every integration (and the future GitLab/Bitbucket support) behaves consistently:

```ts
// src/lib/integrations/credentials.ts (target)
interface ProviderCredentials {
  // Returns a valid bearer token, refreshing/minting if needed.
  // Guarantees single-flight refresh for rotating-refresh providers.
  getAccessToken(orgId: string, provider: Provider): Promise<string>;
}
```

Implementation rules:
- **GitHub:** mint via App JWT, cache in-process (Phase 1) keyed by installation ID with expiry; re-mint at T-5min.
- **GitLab/Bitbucket:** read encrypted tokens from DB; if access token is expiring, acquire `pg_advisory_xact_lock(hashtext(orgId||provider))`, re-check freshness inside the lock (double-checked locking), refresh once, **persist the rotated refresh token**, release. This makes concurrent callers wait for the single refresh instead of racing.
- All tokens remain **encrypted at rest** via the existing `token-crypto.ts` (AES-256-GCM).

This design needs **no Valkey** even at multi-replica scale because the advisory lock lives in Postgres. Valkey would only later reduce GitHub mint chatter (optimization, not correctness).

---

## 3. Target topology per phase

**Phase 1 (now):**

```text
   Browser / Agent API
          │
   ┌──────▼───────┐        ┌──────────────────────────────┐
   │  web (1 proc) │◀──────▶│  PostgreSQL 16                │
   │  Next.js      │ enqueue│   app data (Prisma, jsonb)    │
   └──────┬───────┘        │   pg-boss (jobs+cron)         │
          │                │   @mastra/pg (agent state)    │
   ┌──────▼───────┐  claim │   pgvector (later phase)      │
   │ worker (1 proc)│◀─────▶│                               │
   │ agents+refresh │       └──────────────────────────────┘
   │ +enrich roles  │
   └───────────────┘
   (in-memory caches OK · no Valkey · no /data/mastra volume)
```

**Phase 4+ (scale, when triggers hit):** add web replicas + Valkey, split worker roles into dedicated pools, add the Python ML service, add Timescale/observability stack. See §4 and §8.

### 3.1 Local-first validation

**Default execution order:** implement and prove locally with Docker images + Postgres first; production is the same image/env model.

| Local (do first) | Production |
|------------------|------------|
| Root `Dockerfile` — web + worker roles (`AIDOS_PROCESS_ROLE`) + `services/ml-inference` | Same images, same env vars, persistent volume for `/data/agent-instructions` only |
| `npm run dev` + worker script for fast iteration on app code | Run containers with the published GHCR tags |
| `DATABASE_URL` on **both** web and worker once pg-boss lands | Same env on both process roles |
| Delete local `.data/mastra/*`; no Mastra file volumes in the image | No `/data/mastra` volume |

**Phase exit criteria apply locally first.** A phase is not done until web + worker + Postgres behave correctly with the Docker images (or `npm run dev` + worker against local Postgres).

---

## 4. Phased execution

Each phase is independently shippable, flag-gated where behavior changes, and reversible. **Validate locally with Docker images first** (D11). **Checkbox progress:** [`architecture-migration-tracker.md`](./architecture-migration-tracker.md).

### Phase 0 — Foundations (no behavior change)

| Task | Detail |
|------|--------|
| `src/lib/env.ts` | Zod schema, parsed once at boot; typed export; fail-fast on missing vars. |
| `src/lib/logger.ts` | `pino` structured logger; replace `console.*` incrementally. Add a correlation ID passed through route → job → run. |
| Health endpoints | `GET /healthz` (liveness, no deps) and `GET /readyz` (checks DB + migrations). |
| Fix stale rule | Update `.cursor/rules/aidos-project.mdc` "SQLite" → PostgreSQL. |

**Exit:** structured logs + health endpoints; env validated at startup. Verified locally (`curl localhost:3000/healthz`, `/readyz`).

### Phase 1 — Unblock scale (highest leverage)

**1a. Mastra → Postgres (removes the file-lock ceiling)**

| Task | Detail |
|------|--------|
| Add dependency | `npm i @mastra/pg`; remove `@mastra/duckdb` from use. |
| Swap default store | In `src/mastra/server.ts`, replace `LibSQLStore` with `PostgresStore({ connectionString: DATABASE_URL })`. |
| Remove DuckDB | Delete the `DuckDBStore` observability domain. Route Mastra observability to the Postgres store (or omit the domain override so it uses the default store). *(Verify the exact `PostgresStore` + observability-domain API against `node_modules/@mastra/pg/dist/docs` at implementation time — per `AGENTS.md`, never assume the API.)* |
| Schema isolation | Point Mastra's tables at a dedicated `mastra` Postgres schema so they never collide with Prisma migrations. |
| Simplify `config/storage.ts` | Drop file-path helpers (`ensureMastraStorageDirs`, DuckDB path); keep only the Postgres connection resolution. |
| No data migration | Project is pre-production; cut over cleanly. Old `.data/mastra/*` files can be deleted. |

**1b. Drop Mastra volumes (after 1a verified)**

| Task | Detail |
|------|--------|
| Docker image / entrypoint | Remove Mastra file volumes + mounts; remove `MASTRA_STORAGE_URL` / `MASTRA_OBSERVABILITY_PATH`. |
| `docker/entrypoint.sh` | Remove `fix_mastra_volume_permissions` and its calls. |

**1c. Introduce pg-boss + bridge the agent queue (removes the atomic-claim race)**

| Task | Detail |
|------|--------|
| Add dependency | `npm i pg-boss`; start it against `DATABASE_URL` in its own `pgboss` schema. |
| Boss singleton | `src/lib/jobs/boss.ts` — lazy singleton, `start()` on first use (mirrors the Prisma lazy pattern). |
| Reference job | Port **one** scheduled job end-to-end first: `grafana.sync` → `boss.schedule(...)` + `boss.work(...)`. Validate retries/DLQ/observability. |
| Agent-wakeup bridge | Keep `enqueueWakeup()` + `AgentWakeupRequest` as source-of-truth/audit. Additionally `boss.send('agent.wakeup', { wakeupId }, { singletonKey: 'wakeup:'+id, priority })`. Worker's `boss.work('agent.wakeup', { teamSize: AGENT_WORKER_CONCURRENCY }, …)` is the **only** place that transitions the row. Replace `worker-poke.ts` HTTP fire-and-forget with `boss.send`. Timer wakeups → `boss.schedule`. Deprecate `POST /api/cron/agents/worker` HTTP drain (410). `recoverStuckRuns` stays as a safety net inside `drainWakeupQueue`. |

**Exit:** two processes can run agent work concurrently with **zero duplicate runs**; `/data/mastra` retired; Grafana sync runs on pg-boss with visible retries. **Proven with Docker images + Postgres before production cutover.**

> Note: Phase 1 still deploys as **one web + one worker** (D4). The point of 1a/1c is to make horizontal scale *possible and safe*, so later phases can add replicas without a rewrite.

### Phase 2 — Unify async & fan-out refresh

| Task | Detail |
|------|--------|
| Migrate all cron | Move every `runScheduled*` cadence onto pg-boss `schedule`; delete `scripts/cron-loop.ts` cadence logic. |
| Fan-out pattern | Replace "loop over all orgs in one request" with `refresh.fanout` (cron) → one `refresh.org` job per org (`singletonKey: refresh:{orgId}:{provider}`, `retryLimit`, backoff). Per-org isolation + retries + DLQ. |
| Shared HTTP client | `src/lib/http/client.ts`: timeouts, exponential backoff + jitter on 429/5xx, per-(org,provider) circuit breaker, token-bucket rate limiter. Refactor GitHub/Jira/Grafana/Prometheus onto it. |
| Credentials contract | Implement §2.1 `ProviderCredentials` incl. Postgres advisory-lock single-flight for GitLab/Bitbucket (even before those integrations ship, so GitHub uses the same contract). |

**Exit:** one slow org can't delay others; upstream 429s handled centrally; scheduler is durable and observable.

### Phase 3 — Data hygiene & tenant safety

| Task | Detail |
|------|--------|
| `String` JSON → `jsonb` | Migrate `*Json` columns to Prisma `Json`/Postgres `jsonb`, column-by-column with a dual-read shim + backfill job. Enables GIN indexes + in-DB filtering. |
| Tenant-safe client | Prisma `$extends` that auto-injects `where: { organizationId }` on tenant-owned models; explicit `asSystem()` escape hatch for cron fan-out. |
| Internal health | `GET /api/internal/health` (worker-secret auth): queue depths, oldest-queued age, stuck-run count, last success per scheduled job, integration staleness. |

**Exit:** JSON is queryable; tenant scoping is structural; operators have a real health surface.

### Phase 4 — AI/ML platform (embeddings + code quality)

See §5 for the service design.

| Task | Detail |
|------|--------|
| pgvector | Enable extension; add `Embedding` model (`vector(384)`, `organizationId`, HNSW index). Reuse `@mastra/pg`'s `PgVector` where it fits. |
| Python inference service | FastAPI service exposing `/embed` and `/score`; model pinned + swappable; containerized separately. |
| Node `ml` worker role | Consumes pg-boss `ml.embed` / `ml.codeQuality` / `evidence.recompute`; calls the Python service; writes vectors/results; tenant-scoped. |
| Evidence feature | Promote the previous sprint-evidence one-off pipeline into `src/lib/evidence/` per the RFC; run as `evidence.recompute` jobs. |
| LLM cost governor | One metered client: per-org token budget, content-hash cache (generalize the briefing `factsHash`), cheap-model routing, per-feature kill-switch. |

**Exit:** first AI/ML feature (Sprint Evidence) runs as a scheduled, metered, retryable job with a swappable embedding model.

### Phase 5 — Volume & horizontal scale (trigger-gated)

| Task | Trigger |
|------|---------|
| **TimescaleDB** on telemetry tables (`TelemetryEvent`, `TelemetryMetric`, `DeploymentEvent`, `WebhookEvent`, `AgentChatStreamChunk`, `AgentHeartbeatRun`, `ActivityEvent`, `AuditLog`): hypertables + compression + retention jobs (pg-boss). Design partition-by-time from Phase 3 so this is non-disruptive. | Telemetry volume makes plain partitioning painful. |
| **Web >1 replica + Valkey** (shared cache, SSE fan-out, cross-replica locks). GitHub token cache + prompt cache move to Valkey behind the existing `CacheClient` interface. | Sustained web CPU or the need for HA/rolling deploys. |
| **Split worker pools** — dedicated replicas per role via `WORKER_QUEUES`. | A queue (e.g. enrich) needs independent scaling. |
| **Read replica** for analytics. | Reporting contends with OLTP. |

**Exit:** platform scales horizontally on demand; hot tables bounded.

---

## 5. ML/embeddings service design (D6)

**Why separate:** the embedding/code-quality model must be swappable (accuracy tuning) without redeploying the app. Because **pg-boss is Node-only**, Python can't consume its jobs directly — so we keep Python as pure compute behind an HTTP contract.

```text
pg-boss  ml.embed / ml.codeQuality / evidence.recompute
   │  (claimed by Node ml worker — same monorepo, WORKER_QUEUES=ml)
   ▼
Node "ml" worker:  fetch inputs (Prisma) ─▶ POST http://ml-service/embed
                   store vectors (pgvector) ◀── {vectors}
                                                   │
                                          ┌────────▼─────────┐
                                          │ Python service    │  separate deploy
                                          │ FastAPI           │  (own image/repo dir)
                                          │  /embed  /score   │
                                          │  model = pinned,  │  swap freely:
                                          │  swappable        │  MiniLM → BGE → CodeT5+
                                          └───────────────────┘
```

- **Contract:** `/embed { texts[] } → { vectors[][] }`, `/score { diff } → { score, rationale }`. Stable across model swaps.
- **Model lifecycle:** pinned model version in the Python service; swapping = redeploy the Python service only. Node/orchestration untouched.
- **Tenancy:** the Node worker enforces `organizationId` on every read/write; the Python service is stateless and org-agnostic.
- **Interface indirection:** callers use an `EmbeddingService` interface; Phase-4a can even start with an in-Node ONNX embedder and switch to the Python service by config if you want to defer standing up Python. (Given D6, we go straight to the Python service.)
- **Alternative considered:** Python polling a dedicated jobs table via `SELECT … FOR UPDATE SKIP LOCKED` (psycopg). Rejected as primary — it duplicates queue logic in a second language. The Node-orchestrator + stateless-Python split keeps **one** queue (pg-boss) as source of truth.

---

## 6. Concrete change list for Phase 1 (files)

| File | Change |
|------|--------|
| `package.json` | `+ @mastra/pg`, `+ pg-boss`; drop `@mastra/duckdb` usage. |
| `src/mastra/server.ts` | `LibSQLStore`→`PostgresStore`; remove `DuckDBStore` + observability DuckDB domain. |
| `src/mastra/config/storage.ts` | Remove file/DuckDB path helpers; add Postgres connection resolution + `mastra` schema. |
| `src/lib/jobs/boss.ts` (new) | pg-boss lazy singleton. |
| `src/lib/agent-control-plane/worker-poke.ts` | Replace HTTP poke with `boss.send('agent.wakeup', …)`. |
| `src/lib/agent-control-plane/worker.ts` | Add `boss.work('agent.wakeup')` handler that wraps `executeHeartbeatRun`; keep old drain behind a flag. |
| `Dockerfile`, `docker/entrypoint.sh` | Remove Mastra file volumes + chown; keep `agent_instructions` (still used). |
| `src/app/healthz`, `src/app/readyz` (new) | Liveness/readiness. |
| `src/lib/env.ts`, `src/lib/logger.ts` (new) | Env validation + structured logging. |

---

## 7. Deferred (with explicit triggers)

| Component | Add when… |
|-----------|-----------|
| **Valkey** | web tier runs >1 replica, OR SSE fan-out must cross replicas, OR cross-instance rate limits/locks needed. (GitLab/Bitbucket refresh does **not** require it — Postgres advisory lock covers that.) |
| **Self-hosted OTel/Grafana LGTM** | you need distributed tracing beyond `AgentHeartbeatRun` + pino logs. |
| **TimescaleDB** | telemetry volume makes plain time-partitioning painful. |
| **BullMQ (Redis)** | pg-boss throughput saturates (sustained thousands of jobs/sec). |
| **Temporal** | pipelines need durable multi-hour timers or human-in-loop waits spanning restarts with mid-flight versioning. |
| **Read replica / separate vector DB** | analytics or HNSW builds contend with OLTP. |

---

## 8. Sequencing summary

```text
Phase 0  Foundations ....... env, pino, /healthz, /readyz
Phase 1  Unblock scale ..... Mastra→Postgres, drop DuckDB+volumes, pg-boss + agent bridge   ◀ do first
Phase 2  Unify async ....... all cron→pg-boss, fan-out refresh, shared HTTP client, creds contract
Phase 3  Data hygiene ...... jsonb, tenant-safe $extends, internal health
Phase 4  AI/ML platform .... pgvector, Python inference service, ml worker, evidence, cost governor
Phase 5  Volume & scale .... TimescaleDB, Valkey + web replicas, split worker pools, read replica
```

Still one web + one worker through Phases 1–4; horizontal scale (replicas + Valkey) turns on in Phase 5 only when a trigger fires. No rewrites are required to cross that boundary because Phases 1–3 make the processes stateless and the queue claim atomic.

---

## 9. Related documents

- [`architecture-migration-tracker.md`](./architecture-migration-tracker.md) — phase completion checklist (update when shipping).
- [`AIDOS-SCALING-ARCHITECTURE.md`](./AIDOS-SCALING-ARCHITECTURE.md) — full analysis, gap register (G1–G12), and rationale behind these decisions.
- [`sprint-ticket-commit-evidence.md`](./sprint-ticket-commit-evidence.md) — the first Phase-4 AI/ML feature.
- `AGENTS.md` — Mastra registration + "verify the installed API" rule (applies to the `@mastra/pg` swap).
- `.github/workflows/docker.yml` — builds app + ML inference images to GHCR.

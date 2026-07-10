# Architecture Migration — Progress Tracker

**Plan:** [`architecture-migration-plan.md`](./architecture-migration-plan.md)  
**Last updated:** 2026-07-10  
**Current focus:** Phase 5 complete — architecture migration plan finished

> Update this file when a phase/sub-phase ships. Keep task wording aligned with the main plan; use checkboxes only here.

---

## Summary

| Phase | Scope | Status | Shipped |
|-------|--------|--------|---------|
| **0** | Foundations (env, logging, health) | **Done** | PR [#1](https://github.com/Suralal001/AIDOS/pull/1) |
| **1a** | Mastra → Postgres | **Done** | PR [#2](https://github.com/Suralal001/AIDOS/pull/2) |
| **1b** | Drop Mastra file volumes | **Done** | PR [#3](https://github.com/Suralal001/AIDOS/pull/3) |
| **1c** | pg-boss + agent wakeup bridge | **Done** | PR [#4](https://github.com/Suralal001/AIDOS/pull/4) |
| **2** | All cron → pg-boss, fan-out refresh | **Done** | PRs #5–#8 (stacked) |
| **3** | jsonb, tenant-safe client, internal health | **Done** | PRs [#9](https://github.com/Suralal001/AIDOS/pull/9)–[#11](https://github.com/Suralal001/AIDOS/pull/11) (stacked) |
| **4** | AI/ML platform (pgvector, Python service) | **Done** | PRs [#12](https://github.com/Suralal001/AIDOS/pull/12)–[#16](https://github.com/Suralal001/AIDOS/pull/16) (stacked) |
| **5** | TimescaleDB, Valkey, horizontal scale | **Done** | PRs [#17](https://github.com/Suralal001/AIDOS/pull/17)–[#20](https://github.com/Suralal001/AIDOS/pull/20) (stacked) |

**Phase 1 overall:** code complete on `dev`.

---

## Phase 0 — Foundations

- [x] `src/lib/env.ts` — Zod schema, fail-fast at boot
- [x] `src/lib/logger.ts` — pino + correlation IDs
- [x] `GET /healthz` and `GET /readyz`
- [x] `.cursor/rules/aidos-project.mdc` — SQLite → PostgreSQL

**Exit criteria**

- [x] Structured logs + health endpoints live
- [x] Env validated at startup

---

## Phase 1 — Unblock scale

### 1a — Mastra → Postgres

- [x] Add `@mastra/pg`; remove `@mastra/duckdb` / `@mastra/libsql` usage
- [x] `PostgresStore` in `src/mastra/server.ts`
- [x] Remove DuckDB observability domain
- [x] Dedicated `mastra` Postgres schema
- [x] Simplify `src/mastra/config/storage.ts` (Postgres connection only)
- [x] Clean cutover (no file data migration)

### 1b — Drop Mastra volumes

- [x] Dropped Mastra file volumes from Docker image / entrypoint
- [x] `docker/entrypoint.sh` — remove `fix_mastra_volume_permissions`

### 1c — pg-boss + agent queue

- [x] Add `pg-boss`; `pgboss` schema
- [x] `src/lib/jobs/boss.ts` — lazy singleton
- [x] Reference job: `grafana.sync` schedule + worker
- [x] Agent wakeup bridge (`agent.wakeup`, `agent.timer-scan`)
- [x] `worker-poke.ts` → `boss.send` (no HTTP poke)
- [x] `POST /api/cron/agents/worker` → 410 (HTTP drain removed)
- [x] Worker process: pg-boss only (`scripts/agent-worker-loop.ts`)

**Exit criteria**

- [x] `/data/mastra` retired
- [x] Agent wakeups dispatched via pg-boss
- [x] Grafana sync on pg-boss (`grafana.sync`)
- [x] Verified end-to-end (web + worker + postgres)

---

## Phase 2 — Unify async & fan-out refresh

- [x] Migrate all `runScheduled*` crons onto pg-boss; retire `scripts/cron-loop.ts`
- [x] Fan-out: `refresh.fanout` → per-org `refresh.org` jobs
- [x] Shared HTTP client (`src/lib/http/client.ts`)
- [x] `ProviderCredentials` contract (§2.1) with advisory-lock refresh

**Exit criteria**

- [x] One slow org cannot block others
- [x] Centralized 429/backoff handling
- [x] Durable, observable scheduler for all integration syncs

---

## Phase 3 — Data hygiene & tenant safety

- [x] `String` JSON → `jsonb` (column-by-column + dual-read shim)
- [x] Tenant-safe Prisma `$extends` (`forOrg`) + `asSystem()` escape hatch
- [x] `GET /api/internal/health` (queue depths, stuck runs, staleness)

**Exit criteria**

- [x] JSON is queryable (Postgres `jsonb`)
- [x] Tenant scoping is structural via `forOrg()`
- [x] Operators have `/api/internal/health` (Bearer `PLATFORM_WORKER_SECRET`)

---

## Phase 4 — AI/ML platform

- [x] pgvector + `Embedding` model
- [x] Python inference service (`/embed`, `/score`)
- [x] Node `ml` worker role
- [x] Evidence feature (`evidence.recompute`)
- [x] LLM cost governor

**Exit criteria**

- [x] Sprint Evidence runs as scheduled `evidence.recompute` jobs (snapshots → embeddings → EvidenceLink)
- [x] Embedding compute is a swappable Python sidecar behind `EmbeddingService`
- [x] Background LLM calls are metered (budget + hash-cache + kill-switch)

---

## Phase 5 — Volume & horizontal scale (trigger-gated)

- [x] TimescaleDB on telemetry tables
- [x] Web >1 replica + Valkey
- [x] Split worker pools (`WORKER_QUEUES`)
- [x] Read replica for analytics

**Exit criteria**

- [x] High-volume tables are Timescale hypertables with compression + retention
- [x] Shared `CacheClient` (Valkey when `VALKEY_URL` set) for tokens / prompts / LLM / SSE wake
- [x] Dedicated worker pools via `WORKER_QUEUES` (role-scoped replicas)
- [x] Analytics reads prefer `DATABASE_URL_REPLICA` via `forOrgRead` / `getPrismaRead`

---

## Notes

- **Scheduled jobs** run on pg-boss via `AIDOS_PROCESS_ROLE=worker`. HTTP `POST /api/cron/*` routes enqueue jobs for manual/external triggers.
- **Integration refresh** uses `refresh.fanout` → `refresh.org` (Jira, Grafana, Prometheus) every 15 min by default.
- **ML worker** (`WORKER_QUEUES=ml` or `all`) consumes `ml.embed`, `ml.codeQuality`, and `evidence.recompute`.
- **Retention worker** (`WORKER_QUEUES=retention` or `all`) runs `retention.ensure` (Timescale policy idempotency).
- **ML inference** URL: `ML_INFERENCE_URL` (default `http://localhost:8080`).
- **Valkey** URL: `VALKEY_URL` (default unset → in-memory single-replica).
- **Read replica** URL: `DATABASE_URL_REPLICA` (optional; falls back to primary).
- **Images:** root `Dockerfile` (web/worker via `AIDOS_PROCESS_ROLE`); `services/ml-inference/Dockerfile`. Built by `.github/workflows/docker.yml`.
- **Locked decisions (D1–D11)** live in the main plan — not tracked here.

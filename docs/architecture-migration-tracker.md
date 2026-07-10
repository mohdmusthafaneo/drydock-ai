# Architecture Migration — Progress Tracker

**Plan:** [`architecture-migration-plan.md`](./architecture-migration-plan.md)  
**Last updated:** 2026-07-10  
**Current focus:** Phase 3 complete — Phase 4 next

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
| **4** | AI/ML platform (pgvector, Python service) | Not started | — |
| **5** | TimescaleDB, Valkey, horizontal scale | Not started | — |

**Phase 1 overall:** code complete on `dev`. Local compose smoke (`docker compose up`) recommended before Coolify cutover (D11).

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

- [x] `docker-compose.yml` — remove `mastra_data` volume + mounts
- [x] `docker/entrypoint.sh` — remove `fix_mastra_volume_permissions`
- [x] `docs/coolify-deploy.md` — remove `/data/mastra` section

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
- [ ] Verified end-to-end on `docker compose up` (web + worker + postgres)

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

- [ ] pgvector + `Embedding` model
- [ ] Python inference service (`/embed`, `/score`)
- [ ] Node `ml` worker role
- [ ] Evidence feature (`evidence.recompute`)
- [ ] LLM cost governor

---

## Phase 5 — Volume & horizontal scale (trigger-gated)

- [ ] TimescaleDB on telemetry tables
- [ ] Web >1 replica + Valkey
- [ ] Split worker pools (`WORKER_QUEUES`)
- [ ] Read replica for analytics

---

## Notes

- **Scheduled jobs** run on pg-boss via `AIDOS_PROCESS_ROLE=worker`. HTTP `POST /api/cron/*` routes enqueue jobs for manual/external triggers.
- **Integration refresh** uses `refresh.fanout` → `refresh.org` (Jira, Grafana, Prometheus) every 15 min by default.
- **Locked decisions (D1–D11)** live in the main plan — not tracked here.

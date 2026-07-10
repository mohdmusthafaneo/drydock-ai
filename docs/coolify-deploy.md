# Coolify Deployment — AIDOS

**Status:** Active · **Phase:** Architecture migration Phase 5  
**Audience:** DevOps / platform engineering

This document covers **web + worker** deployment on Coolify with a shared volume for agent instructions. Mastra workflow/agent state lives in PostgreSQL (`mastra` schema via `@mastra/pg`). Phase 5 adds optional Valkey, TimescaleDB, split worker pools, and a read replica.

---

## Architecture

```text
┌─────────────────┐     HTTP (internal)      ┌─────────────────┐
│  web replica(s) │◄───────────────────────────│ worker pool(s)  │
│  AIDOS_PROCESS_ │                            │ AIDOS_PROCESS_  │
│  ROLE=web       │                            │ ROLE=worker     │
│  Next.js :3000  │                            │ WORKER_QUEUES=… │
└────────┬────────┘                            └────────┬────────┘
         │                                              │
         ├──────────── Valkey (optional) ───────────────┤
         │         shared cache / SSE wake              │
         └──────────────────┬───────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │  PostgreSQL + Timescale   │
              │  + pgvector               │
              │  Prisma + Mastra + jobs   │
              │  (+ optional read replica)│
              └───────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │  Shared volume (bind or named)       │
         │  /data/agent-instructions            │
         └─────────────────────────────────────┘
```

Both containers use the same Docker image (`Dockerfile`). The entrypoint (`docker/entrypoint.sh`) branches on `AIDOS_PROCESS_ROLE`:

| Role | Behavior |
|------|----------|
| `web` | `prisma migrate deploy` → `node server.js` |
| `worker` | `npx tsx scripts/agent-worker-loop.ts` (pg-boss consumers; requires `DATABASE_URL`) |

---

## Required environment variables

Set these on **both** web and worker services unless noted.

| Variable | Web | Worker | Notes |
|----------|-----|--------|-------|
| `DATABASE_URL` | ✓ | ✓ | Postgres + Timescale + pgvector; Prisma (`public`) + Mastra (`mastra`) + pg-boss (`pgboss`) |
| `DATABASE_URL_REPLICA` | ✓ | — | Optional read replica for analytics (`getPrismaRead`) |
| `VALKEY_URL` | ✓ | ✓ | Required when web replicas > 1 (`redis://…`); omit for in-memory single replica |
| `WORKER_QUEUES` | — | ✓ | `all` (default) or comma list: `agents`, `refresh`, `enrich`, `ml`, `retention` |
| `ML_INFERENCE_URL` | — | ml | Python sidecar, e.g. `http://ml-inference:8080` |
| `AUTH_SECRET` | ✓ | — | Session signing |
| `PLATFORM_WORKER_SECRET` | ✓ | — | Web cron routes (Jira/Grafana sync, etc.) |
| `AIDOS_PROCESS_ROLE` | `web` | `worker` | |
| `AIDOS_API_URL` | — | ✓ | Internal URL of web service, e.g. `http://aidos-web:3000` |
| `NEXT_PUBLIC_APP_URL` | ✓ | — | Public app URL (no trailing slash) |
| `ANTHROPIC_API_KEY` | ✓ | ✓ | Required for Mastra agent execution |
| `ANTHROPIC_BASE_URL` | ✓ | ✓ | Default MiniMax-compatible endpoint |
| `ANTHROPIC_MODEL` | ✓ | ✓ | e.g. `MiniMax-M3` |
| `AGENT_INSTRUCTIONS_ROOT` | ✓ | ✓ | `/data/agent-instructions` |
| `MASTRA_PG_SCHEMA` | ✓ | ✓ | Optional; default `mastra` |
| `AGENT_WORKER_ENABLED` | ✓ | ✓ | `true` |

---

## Shared volumes

### Agent instructions — `/data/agent-instructions`

Per-org managed `AGENTS.md` bundles are written here at runtime (hire, instruction edits). Both web and worker need read/write access.

```yaml
volumes:
  - agent_instructions:/data/agent-instructions
```

The entrypoint runs `chown -R nextjs:nodejs` on this path at startup (web role) so the non-root `nextjs` user can write after Coolify mounts the volume as root.

### Backup

Back up PostgreSQL (includes Prisma app data and the `mastra` schema). Agent instruction bundles are in the `/data/agent-instructions` volume.

---

## Coolify service configuration

### Web service

- **Build:** Dockerfile from repo root
- **Port:** 3000
- **Health check:** `GET /healthz` (liveness), `GET /readyz` (readiness)
- **Volumes:** `agent_instructions`
- **Env:** `AIDOS_PROCESS_ROLE=web`, plus shared vars above
- **Replicas > 1:** set `VALKEY_URL` so GitHub token / LLM / prompt caches and SSE wake are shared

### Worker service (single pool)

- **Same image** as web (no separate build)
- **No public port** required
- **Volumes:** same `agent_instructions` mount
- **Env:** `AIDOS_PROCESS_ROLE=worker`, `WORKER_QUEUES=all`, `AIDOS_API_URL=http://<web-service-name>:3000`
- **Depends on:** web service started

### Split worker pools (optional)

When one queue needs independent scale, deploy additional Coolify services from the **same image** with different `WORKER_QUEUES`:

| Service | `WORKER_QUEUES` | Consumes |
|---------|-----------------|----------|
| worker-agents | `agents` | `agent.wakeup`, `agent.timer-scan` |
| worker-refresh | `refresh` | `refresh.fanout` / `refresh.org` |
| worker-enrich | `enrich` | domain enrich fan-outs |
| worker-ml | `ml` | `ml.embed`, `ml.codeQuality`, `evidence.recompute` |
| worker-retention | `retention` | `retention.ensure` |

Do **not** run `WORKER_QUEUES=all` alongside dedicated pools for the same queues (duplicate consumers are safe for pg-boss claim, but waste capacity).

Local reference: `docker compose -f docker-compose.yml -f docker-compose.workers.yml --profile split up`.

Use Coolify's internal service hostname for `AIDOS_API_URL` (the Docker network name Coolify assigns to the web container).

---

## Deploy checklist

1. **Pre-deploy:** Run `npx tsx scripts/migrate-adapter-type-mastra.ts --apply` on staging DB so all agents use `adapterType=mastra`.
2. **Schema:** Deploy Prisma migrations (includes Timescale hypertables in Phase 5).
3. **Volumes:** Mount `/data/agent-instructions` on web + worker.
4. **Env:** Verify `DATABASE_URL`, `PLATFORM_WORKER_SECRET`, and `ANTHROPIC_API_KEY` on both services. Set `VALKEY_URL` before scaling web > 1.
5. **Smoke test:** Manual invoke, chat thread message, approval flow on one org.
6. **Load test:** `npm run load-test:chat-wakeups` on staging (see script output).
7. **Monitor 24h:** Worker error rate, Postgres `mastra` schema growth, P95 heartbeat duration, Valkey memory if enabled.

---

## Local Docker Compose reference

See `docker-compose.yml` for web + worker + Timescale Postgres + Valkey + `ml-inference`.

- Phase 4: Python ML sidecar on port 8080 (`ML_INFERENCE_URL`).
- Phase 5: Valkey on 6379; optional split workers via `docker-compose.workers.yml`.

**Note:** Switching from `pgvector/pgvector:pg16` to `timescale/timescaledb-ha:pg16` requires a fresh Postgres volume locally.

---

## Rollback

Keep the previous release artifact for 48h. If smoke fails after cutover:

1. Revert application deploy.
2. Run `UPDATE "AgentRegistry" SET "adapterType" = 'llm' WHERE "adapterType" = 'mastra'` only if rolling back to a pre-M2 release that still ships the legacy LLM adapter.

Mastra state is in Postgres; no file volume rollback is needed.

# Coolify Deployment — AIDOS

**Status:** Active · **Phase:** M4 (Mastra hardening)  
**Audience:** DevOps / platform engineering

This document covers split **web + worker** deployment on Coolify with shared volumes for agent instructions and Mastra observability storage.

---

## Architecture

```text
┌─────────────────┐     HTTP (internal)      ┌─────────────────┐
│  web container  │◄───────────────────────────│ worker container│
│  AIDOS_PROCESS_ │                            │ AIDOS_PROCESS_  │
│  ROLE=web       │                            │ ROLE=worker     │
│  Next.js :3000  │                            │ agent-worker-   │
└────────┬────────┘                            │ loop            │
         │                                     └────────┬────────┘
         │                                              │
         └──────────────────┬───────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │  PostgreSQL (Coolify DB)   │
              └───────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │  Shared volumes (bind or named)      │
         │  /data/agent-instructions            │
         │  /data/mastra                        │
         └─────────────────────────────────────┘
```

Both containers use the same Docker image (`Dockerfile`). The entrypoint (`docker/entrypoint.sh`) branches on `AIDOS_PROCESS_ROLE`:

| Role | Behavior |
|------|----------|
| `web` | `prisma migrate deploy` → `node server.js` |
| `worker` | `node scripts/agent-worker-loop.mjs` (polls worker API) |

---

## Required environment variables

Set these on **both** web and worker services unless noted.

| Variable | Web | Worker | Notes |
|----------|-----|--------|-------|
| `DATABASE_URL` | ✓ | — | Worker does not connect to Postgres directly |
| `AUTH_SECRET` | ✓ | — | Session signing |
| `PLATFORM_WORKER_SECRET` | ✓ | ✓ | Must match on both services |
| `AIDOS_PROCESS_ROLE` | `web` | `worker` | |
| `AIDOS_API_URL` | — | ✓ | Internal URL of web service, e.g. `http://aidos-web:3000` |
| `NEXT_PUBLIC_APP_URL` | ✓ | — | Public app URL (no trailing slash) |
| `ANTHROPIC_API_KEY` | ✓ | ✓ | Required for Mastra agent execution |
| `ANTHROPIC_BASE_URL` | ✓ | ✓ | Default MiniMax-compatible endpoint |
| `ANTHROPIC_MODEL` | ✓ | ✓ | e.g. `MiniMax-M3` |
| `AGENT_INSTRUCTIONS_ROOT` | ✓ | ✓ | `/data/agent-instructions` |
| `MASTRA_STORAGE_URL` | ✓ | ✓ | `file:/data/mastra/store.db` |
| `MASTRA_OBSERVABILITY_PATH` | ✓ | ✓ | `/data/mastra/observability.duckdb` |
| `AGENT_WORKER_ENABLED` | ✓ | ✓ | `true` |
| `AGENT_WORKER_INTERVAL_SEC` | — | ✓ | Default `30` in production |

---

## Shared volumes

### 1. Agent instructions — `/data/agent-instructions`

Per-org managed `AGENTS.md` bundles are written here at runtime (hire, instruction edits). Both web and worker need read/write access.

```yaml
volumes:
  - agent_instructions:/data/agent-instructions
```

The entrypoint runs `chown -R nextjs:nodejs` on this path at startup (web role) so the non-root `nextjs` user can write after Coolify mounts the volume as root.

### 2. Mastra storage — `/data/mastra`

Mastra LibSQL store and DuckDB observability domain must survive container restarts and be accessible from **both** web and worker:

| File | Env var | Purpose |
|------|---------|---------|
| `store.db` | `MASTRA_STORAGE_URL=file:/data/mastra/store.db` | Workflow/agent run state |
| `observability.duckdb` | `MASTRA_OBSERVABILITY_PATH=/data/mastra/observability.duckdb` | Traces, spans, token detail |

```yaml
volumes:
  - mastra_data:/data/mastra
```

**Coolify setup:**

1. Create a persistent volume (or bind mount) named e.g. `aidos-mastra`.
2. Mount at `/data/mastra` on **both** web and worker services.
3. Set `MASTRA_STORAGE_URL` and `MASTRA_OBSERVABILITY_PATH` as above on both services.

> **LibSQL file locking:** Web and worker may both read/write the same LibSQL file. Monitor for lock contention under load (Phase M4 load test). If issues arise, restrict Mastra writes to the worker container only and serve trace reads from web via API — see [migration-plan.md](./migration-plan.md) §13 open items.

### Backup

Include `/data/mastra` in your backup schedule alongside PostgreSQL. Traces are authoritative for token detail; Prisma `AgentHeartbeatRun` stores rollup pointers only.

---

## Coolify service configuration

### Web service

- **Build:** Dockerfile from repo root
- **Port:** 3000
- **Health check:** `GET /` or your app health endpoint
- **Volumes:** `agent_instructions`, `mastra_data`
- **Env:** `AIDOS_PROCESS_ROLE=web`, plus shared vars above

### Worker service

- **Same image** as web (no separate build)
- **No public port** required
- **Volumes:** same `agent_instructions` and `mastra_data` mounts
- **Env:** `AIDOS_PROCESS_ROLE=worker`, `AIDOS_API_URL=http://<web-service-name>:3000`
- **Depends on:** web service started

Use Coolify's internal service hostname for `AIDOS_API_URL` (the Docker network name Coolify assigns to the web container).

---

## Deploy checklist

1. **Pre-deploy:** Run `npx tsx scripts/migrate-adapter-type-mastra.ts --apply` on staging DB so all agents use `adapterType=mastra`.
2. **Schema:** Deploy Prisma migrations (`mastraRunId`, `mastraTraceId` columns, `adapterType` default).
3. **Volumes:** Mount `/data/agent-instructions` and `/data/mastra` on web + worker.
4. **Env:** Verify `PLATFORM_WORKER_SECRET`, `ANTHROPIC_API_KEY`, and Mastra paths match on both services.
5. **Smoke test:** Manual invoke, chat thread message, approval flow on one org.
6. **Load test:** `npm run load-test:chat-wakeups` on staging (see script output).
7. **Monitor 24h:** Worker error rate, `/data/mastra` disk usage, P95 heartbeat duration.

---

## Local Docker Compose reference

See `docker-compose.yml` for a minimal web + worker + Postgres setup with shared volumes. Production Coolify config mirrors the volume and env patterns documented here.

---

## Rollback

Keep the previous release artifact for 48h. If smoke fails after cutover:

1. Revert application deploy.
2. Run `UPDATE "AgentRegistry" SET "adapterType" = 'llm' WHERE "adapterType" = 'mastra'` only if rolling back to a pre-M2 release that still ships the legacy LLM adapter.

Mastra storage files are forward-compatible; no rollback needed for `/data/mastra` unless corruption is suspected.

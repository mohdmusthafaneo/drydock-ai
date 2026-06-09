# Grafana integration contract

**Status:** G1 frozen · connect + probe · scope/sync in G2–G3  
**Related:** [`grafana-setup.md`](../grafana-setup.md), [`docs/prometheus-integration.md`](prometheus-integration.md)

Per-org Grafana URL and service account token stored encrypted in `Integration.metadataJson` (`provider = GRAFANA`). Read-only Grafana HTTP API only.

---

## 1. Metadata schema

Stored in `Integration.metadataJson` for `provider = GRAFANA`:

| Field | Type | Notes |
|-------|------|-------|
| `mode` | `"grafana-readonly"` | Distinguishes real connect from legacy `observability-stub` |
| `grafanaUrl` | `string` | Base URL, e.g. `https://grafana.example.com` (no trailing slash) |
| `authType` | `"bearer"` \| `"none"` | v1: service account token only; `none` for open dev instances |
| `apiTokenEnc` | `string` | Encrypted via `token-crypto` |
| `dashboardScopes` | `GrafanaDashboardScope[]` | Max 15 — G2 |
| `tagFilter` | `string[]` | Optional — G2 |
| `alertLabelSelectors` | `Record<string, string>` | Optional — G2 |
| `webhookSecret` | `string` | Shared secret for G4 webhook verify |
| `operationalSnapshot` | `GrafanaOperationalSnapshot` | Latest computed rollup — G3 |
| `lastSyncSummary` | `string` | Human-readable sync result |
| `connectionStatus` | `"ok"` \| `"error"` | Last probe result |
| `lastConnectionCheckAt` | ISO string | Last successful/failed probe |
| `lastError` | `string` | Last connection or sync error |
| `connectedBy` | `string` | User id who connected |

**Never return** `apiTokenEnc` or decrypted tokens from any API route.

---

## 2. Tenancy & auth

- All routes scope by `session.organizationId`.
- Connect, scope save, and sync require `integrations.manage_integrations`.
- View-only users may read Observability dashboard (G5) but cannot connect or sync.
- One Grafana URL per org (v1).

---

## 3. API routes

### G1 — Connect

`POST /api/integrations/grafana/connect`

**Body (Zod):**

```ts
{
  grafanaUrl: string;       // required, normalized (trim, strip trailing /)
  authType: "bearer" | "none";
  apiToken?: string;        // required on first bearer connect; optional on update
}
```

**Flow:**

1. Validate session + `manage_integrations`.
2. Normalize URL; reject invalid URLs.
3. Encrypt new token; preserve existing encrypted value when token omitted on update.
4. `probeGrafana(url, auth)` — `GET /api/health` (fallback: `GET /api/org`).
5. Upsert `Integration` with `status: CONNECTED`, `mode: grafana-readonly`.
6. Write `ActivityEvent` + `AuditLog`.

**Response:** `{ ok: true, grafanaUrl, connectionStatus: "ok" }` — never include tokens.

**Errors:** `401` unauthorized · `403` forbidden · `400` validation · `502` probe failed

### Disconnect

Reuse `POST /api/integrations/disconnect` with `{ provider: "GRAFANA" }`.

### G2 — Scopes

`GET /api/integrations/grafana/scopes` — list dashboards/folders  
`PUT /api/integrations/grafana/scopes` — save `dashboardScopes` (max 15)

### G3 — Sync

`POST /api/integrations/grafana/sync` — fetch alerts, annotations, dashboard meta; write `TelemetryMetric` + `operationalSnapshot`

### Block stub connect

`POST /api/integrations/connect` with `provider: "GRAFANA"` returns `400` — use dedicated connect route.

---

## 4. HTTP client (`grafana-api.ts`)

Read-only endpoints (G2–G3):

- `GET /api/search?type=dash-db&limit=500`
- `GET /api/dashboards/uid/{uid}`
- `GET /api/alertmanager/grafana/api/v2/alerts`
- `GET /api/annotations?from={ms}&to={ms}&limit=100`

Auth headers:

| `authType` | Header |
|------------|--------|
| `bearer` | `Authorization: Bearer <service_account_token>` |
| `none` | *(none)* |

Probe succeeds when `GET /api/health` returns `database: "ok"`, or `GET /api/org` returns HTTP 200.

---

## 5. Platform env

| Variable | Purpose |
|----------|---------|
| `PLATFORM_WORKER_SECRET` | Scheduled sync worker (G7) — reuse Jira pattern |
| `AUTH_SECRET` | Token encryption key (existing) |

No per-tenant Grafana URL in platform `.env`.

---

## 6. Alert webhook (G4)

`POST /api/webhooks/grafana?organizationId=<id>`

Verify `metadata.webhookSecret` via custom header `X-AIDOS-Webhook-Secret` or query param `secret`.

---

## 7. Shipped files

| Phase | Path |
|-------|------|
| G0 | `src/lib/grafana-meta.ts`, `src/lib/observability-connectivity.ts` |
| G1 | `src/lib/grafana-api.ts`, `src/app/api/integrations/grafana/connect/route.ts`, `src/components/integrations/grafana-integration-panel.tsx` |
| G2 | `src/lib/grafana-scope-selection.ts`, scopes route, scope UI in panel |
| G3 | `src/lib/grafana-sync.ts`, `src/lib/grafana/health-score.ts`, sync route |

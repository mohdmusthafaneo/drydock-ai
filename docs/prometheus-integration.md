# Prometheus integration contract

**Status:** P2a frozen · connect + probe · scope/sync in P2b–P2c  
**Related:** [`prometheus-analysis.md`](../prometheus-analysis.md) §8

Per-org Prometheus URL and API credentials stored encrypted in `Integration.metadataJson` (`provider = PROMETHEUS`). Read-only PromQL query API only.

---

## 1. Metadata schema

Stored in `Integration.metadataJson` for `provider = PROMETHEUS`:

| Field | Type | Notes |
|-------|------|-------|
| `mode` | `"prometheus-readonly"` | Distinguishes real connect from legacy `observability-stub` |
| `prometheusUrl` | `string` | Base URL, e.g. `https://prometheus.example.com` (no trailing slash) |
| `authType` | `"bearer"` \| `"basic"` \| `"none"` | v1 default: bearer |
| `apiTokenEnc` | `string` | Encrypted bearer token via `token-crypto` |
| `basicUsername` | `string` | Plain username (basic auth only) |
| `basicPasswordEnc` | `string` | Encrypted password (basic auth only) |
| `serviceScopes` | `PrometheusServiceScope[]` | Max 10 — P2b |
| `promqlOverrides` | `Record<string, string>` | Optional per-template overrides — P2b |
| `alertmanagerWebhookSecret` | `string` | Shared secret for P4 webhook verify |
| `operationalSnapshot` | object | Latest computed rollup — P2c |
| `lastSyncSummary` | `string` | Human-readable sync result |
| `connectionStatus` | `"ok"` \| `"error"` | Last probe result |
| `lastConnectionCheckAt` | ISO string | Last successful/failed probe |
| `lastError` | `string` | Last connection or sync error |
| `connectedBy` | `string` | User id who connected |

**Never return** `apiTokenEnc`, `basicPasswordEnc`, or decrypted secrets from any API route.

---

## 2. Tenancy & auth

- All routes scope by `session.organizationId`.
- Connect, scope save, and sync require `integrations.manage_integrations`.
- View-only users may read Observability dashboard (P2) but cannot connect or sync.
- One Prometheus URL per org (v1). Multi-cluster via label scopes, not multiple integrations.

---

## 3. API routes

### P2a — Connect

`POST /api/integrations/prometheus/connect`

**Body (Zod):**

```ts
{
  prometheusUrl: string;       // required, normalized (trim, strip trailing /)
  authType: "bearer" | "basic" | "none";
  apiToken?: string;           // required on first bearer connect; optional on update
  basicUsername?: string;      // required for basic
  basicPassword?: string;      // required on first basic connect; optional on update
}
```

**Flow:**

1. Validate session + `manage_integrations`.
2. Normalize URL; reject invalid URLs.
3. Encrypt new credentials; preserve existing encrypted values when token/password omitted on update.
4. `probePrometheus(url, auth)` — `GET /api/v1/query?query=up` (fallback: `/api/v1/status/runtimeinfo`).
5. Upsert `Integration` with `status: CONNECTED`, `mode: prometheus-readonly`.
6. Write `ActivityEvent` + `AuditLog`.

**Response:** `{ ok: true, prometheusUrl, connectionStatus: "ok" }` — never include tokens.

**Errors:** `401` unauthorized · `403` forbidden · `400` validation · `502` probe failed

### Disconnect

Reuse `POST /api/integrations/disconnect` with `{ provider: "PROMETHEUS" }`.

### P2b — Scopes

`GET /api/integrations/prometheus/scopes` — discover label values  
`PUT /api/integrations/prometheus/scopes` — save `serviceScopes` (max 10)

### P2c — Sync

`POST /api/integrations/prometheus/sync` — run PromQL templates, write `TelemetryMetric` + `operationalSnapshot`

### Block stub connect

`POST /api/integrations/connect` with `provider: "PROMETHEUS"` returns `400` — use dedicated connect route.

---

## 4. HTTP client (`prometheus-api.ts`)

Read-only endpoints:

- `GET /api/v1/query?query=<promql>`
- `GET /api/v1/query_range?query=<promql>&start=&end=&step=` (P2c)

Auth headers:

| `authType` | Header |
|------------|--------|
| `bearer` | `Authorization: Bearer <token>` |
| `basic` | `Authorization: Basic <base64(user:pass)>` |
| `none` | *(none)* |

Probe succeeds when Prometheus returns HTTP 200 with `status: "success"` in JSON body.

---

## 5. Platform env

| Variable | Purpose |
|----------|---------|
| `PLATFORM_WORKER_SECRET` | Scheduled sync worker (P3b) — reuse Jira pattern |
| `AUTH_SECRET` | Token encryption key (existing) |

No per-tenant Prometheus URL in platform `.env`.

---

## 6. Alertmanager webhook (P4)

`POST /api/webhooks/prometheus?organizationId=<id>`

Verify `metadata.alertmanagerWebhookSecret` via custom header `X-AIDOS-Webhook-Secret` or query param `secret`. Alertmanager has no native HMAC — shared secret only.

---

## 7. Shipped files

| Phase | Path |
|-------|------|
| P2a | `src/lib/prometheus-meta.ts`, `src/lib/prometheus-api.ts`, `src/app/api/integrations/prometheus/connect/route.ts`, `src/components/integrations/prometheus-integration-panel.tsx` |
| P2b | `src/lib/prometheus-scope-selection.ts`, scopes route, scope UI in panel |
| P2c | `src/lib/prometheus/promql-templates.ts`, `src/lib/prometheus-sync.ts`, sync route |

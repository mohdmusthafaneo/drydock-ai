# AIDOS Phase 1 — Detailed Execution Plan

> **SUPERSEDED — 2026-09-03.** AIDOS is sunsetted. The active plan is
> `docs/DRYDOCK-BUILD-PLAN.md`. Retained for reference only.

**Enterprise Core Platform · 4–6 weeks**

> Phase 1 is **not** AI automation. It is the **enterprise-grade governance & observability foundation**.  
> Outcome: *A production-ready enterprise operational intelligence shell.*

**Related:** [`AIDOS-USP.md`](./AIDOS-USP.md) · [`AIDOS-ENTERPRISE-ROADMAP.md`](./AIDOS-ENTERPRISE-ROADMAP.md)

---

## Objectives (end of Phase 1)

- Enterprise authentication & RBAC (SSO/MFA planned; email + JWT + permission matrix in app)
- Organization onboarding & governance setup
- Integration hub (OAuth, webhooks, health)
- Telemetry ingestion & event normalization
- Observability foundation & operational dashboard shell
- Governance foundation (approvals, audit, policies)
- AI-ready orchestration infrastructure (**no advanced agents**)

---

## Architecture

```
Frontend (Next.js)
      ↓
API routes (app router)
      ↓
Core services (lib/)
      ↓
Integration layer
      ↓
Telemetry pipeline
      ↓
Operational data layer (Prisma / SQLite → PostgreSQL later)
```

---

## Modules & repo mapping

| Module | Status in repo | Key paths |
|--------|----------------|-----------|
| Authentication & RBAC | Partial | `src/lib/auth.ts`, `permissions.ts`, `rbac.ts` |
| Organization management | Partial | `governance/setup`, `settings`, `api/discovery` |
| Integration hub | Partial | `integrations/page.tsx`, `api/integrations/*`, `api/webhooks/[provider]` |
| Telemetry pipeline | Partial | `telemetry-ingest.ts`, `api/telemetry/ingest` |
| Operational dashboard | Partial | `dashboard/page.tsx`, `operational-timeline.tsx` |
| Governance foundation | Partial | `approvals`, `GovernancePolicy`, `enterprise-seed.ts` |
| Audit & logging | Exists | `AuditLog`, `audit/page.tsx` |

---

## Milestones (summary)

| Week | Milestone | Focus |
|------|-----------|--------|
| 1 | Project foundation | Standards, CI (planned), infra (planned) |
| 1–2 | Frontend shell | App shell, design tokens, auth UI, dashboard framework |
| 2 | Auth & RBAC | JWT, permission matrix, SSO/MFA (planned) |
| 2–3 | Organization mgmt | Onboarding, team invites, Delivery DNA |
| 3–4 | Integration hub | GitHub, Jira, Jenkins, Grafana, Prometheus + webhooks |
| 4–5 | Telemetry pipeline | Ingest, normalize, `TelemetryEvent`, webhooks |
| 5 | Operational dashboard | Release, telemetry, timeline, rule-based insights |
| 5–6 | Governance foundation | Approvals, audit, policies, explainability hooks |

---

## Success criteria

Phase 1 is complete when:

- Enterprise onboarding works end-to-end
- Telemetry ingestion & normalized events persist
- Dashboard shows operational visibility
- Approvals & audit logging function
- Integrations sync with health status
- Governance policies are stored per org
- Platform is production-deployable
- **No** autonomous agents or copilot-first UX

---

## What Phase 1 is NOT

- AI automation at scale
- Autonomous agents
- Copilots as the headline
- LLM-driven workflow execution

---

*Implementation tracking: update this doc and `AIDOS-ENTERPRISE-ROADMAP.md` as milestones ship.*

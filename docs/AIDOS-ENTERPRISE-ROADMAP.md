# AIDOS Enterprise Implementation Roadmap

> **SUPERSEDED — 2026-09-03.** AIDOS is sunsetted. See `docs/DRYDOCK-CONCEPT.md` and
> `docs/DRYDOCK-BUILD-PLAN.md`. Retained for reference only.

**AI Governance + QA Intelligence + Observability Platform**  
Enterprise milestones and execution blueprint.

| | |
|---|---|
| **Source document** | `docs/source/AIDOS_Enterprise_Implementation_Roadmap.docx` |
| **Positioning** | Must align with [`AIDOS-USP.md`](./AIDOS-USP.md) |
| **MVP wedge (in parallel)** | [`MVP-DEVELOPMENT-PLAN.md`](./MVP-DEVELOPMENT-PLAN.md) — Accelerator for startups/incubators |
| **Last imported** | 2026-05-18 |

---

## How this roadmap fits AIDOS

This roadmap is the **enterprise product execution plan**. It is not a list of “more AI agents.” It builds the layer described in the USP:

> **Governance-Aware Agentic Operational Intelligence**

| Enterprise pain | Roadmap answer |
|-----------------|----------------|
| Trust, auditability, AI control | Phases 3, 7 — governance engine, explainability, human approval |
| Observability & operational visibility | Phases 2, 6 — telemetry, correlation, operational graph |
| Release confidence & QA | Phase 4 — QA intelligence, readiness scoring |
| Orchestration chaos at scale | Phases 5, 7 — agentic orchestration, **human-governed** automation |
| Fragmented tools (GitHub, Jira, Grafana, K8s) | Phases 1–2 — integration hub + unified intelligence layer |

**MVP Accelerator** (separate plan) is a **wedge** for fast adoption (idea → governed package). Enterprise phases below are the **platform** that Accelerator customers grow into.

---

## Phase overview

| Phase | Name | Duration | Primary output |
|-------|------|----------|----------------|
| **0** | Foundation & enterprise architecture | 2–4 weeks | HLD, LLD, API standards, governance model, event standards |
| **1** | Enterprise core platform | 4–6 weeks | SSO/RBAC shell, integrations, telemetry foundation |
| **2** | Observability intelligence layer | 5–7 weeks | Correlation engine, operational dashboards, AI observability |
| **3** | Delivery governance engine | 5–6 weeks | Release governance, explainability, audit, approvals |
| **4** | QA intelligence engine | 5–7 weeks | Regression intelligence, readiness scoring, QA dashboards |
| **5** | Agentic orchestration layer | 6–8 weeks | Governance-aware agents, multi-agent workflows, recommendations |
| **6** | Enterprise operational intelligence | 6–10 weeks | Predictive ops, maturity analytics, executive dashboards |
| **7** | Controlled automation | 8–12 weeks | Low-risk automation; production changes stay human-governed |

---

## Phase 0 — Foundation & enterprise architecture (2–4 weeks)

**Goals**

- Finalize enterprise product scope and positioning
- Define governance architecture and operational workflows
- Design observability-first architecture
- Define AI orchestration architecture
- Build design system (Portkey, Datadog, Grafana Cloud, Linear inspiration)
- Create database schema and deployment architecture

**Outputs**

- HLD, LLD, API standards, governance model, event standards

**Repo alignment (2026-05)**

| Item | Status |
|------|--------|
| USP & positioning doc | ✅ `docs/AIDOS-USP.md` |
| Marketing / app design tokens (Figtree, `#090a0b`, brand cyan) | ✅ In progress |
| Prisma schema, Next.js app shell | ✅ |
| Formal HLD/LLD pack | ⬜ |

---

## Phase 1 — Enterprise core platform (4–6 weeks)

**Goals**

- SSO, RBAC, MFA, tenant isolation, role hierarchy
- Organization onboarding and governance setup
- Integration hub: GitHub, Jira, Jenkins, Grafana, Prometheus
- Telemetry ingestion and event normalization
- Webhook registration and metadata sync

**Outputs**

- Enterprise-ready platform shell and telemetry foundation

**Repo alignment**

| Item | Status |
|------|--------|
| Auth (email/password), session, org tenancy | ✅ |
| RBAC roles, workspace modes (MVP / Enterprise) | ✅ Partial |
| Governance setup, integrations UI | ✅ Partial |
| SSO, MFA | ⬜ |
| Full integration hub + normalized telemetry pipeline | ⬜ |

---

## Phase 2 — Observability intelligence layer (5–7 weeks)

**Goals**

- Telemetry intelligence engine
- Collect logs, metrics, traces, deployment events, AI runtime events
- Observability correlation engine (deployments, incidents, telemetry, regressions)
- Operational intelligence dashboard
- AI observability (LangSmith, Helicone)

**Outputs**

- AI-native observability and operational intelligence platform

**Repo alignment**

| Item | Status |
|------|--------|
| Observability, DevOps, incidents pages | ✅ UI + seed data |
| Live telemetry ingestion / correlation | ⬜ |
| LangSmith / Helicone integration | ⬜ |

---

## Phase 3 — Delivery governance engine (5–6 weeks)

**Goals**

- Release governance engine
- Governance workflows and escalation policies
- Explainability engine for AI decisions
- Audit and compliance engine
- Release approval orchestration

**Outputs**

- Enterprise governance and explainable AI platform

**Repo alignment**

| Item | Status |
|------|--------|
| Releases, approvals, workflow center, audit logs | ✅ Partial |
| Explainability + policy engine | ⬜ |
| Full release governance automation | ⬜ |

---

## Phase 4 — QA intelligence engine (5–7 weeks)

**Goals**

- Regression intelligence
- Release readiness scoring
- Test intelligence engine
- QA operational dashboards
- Flaky tests and regression hotspot analysis

**Outputs**

- AI-powered QA intelligence and release confidence system

**Repo alignment**

| Item | Status |
|------|--------|
| QA page, release assessment hooks | ✅ Partial |
| Dedicated QA intelligence engine | ⬜ Deferred in MVP plan |

---

## Phase 5 — Agentic orchestration layer (6–8 weeks)

**Goals**

- Governance-aware AI agents
- Multi-agent orchestration workflows
- AI recommendation engine
- Human-governed execution workflows
- Integrate LangGraph, Temporal.io, CrewAI, OpenAI Agents SDK

**Outputs**

- Agentic operational intelligence layer

**Repo alignment**

| Item | Status |
|------|--------|
| Agents UI, recommendations, human approval | ✅ Partial |
| LangGraph / Temporal / multi-agent runtime | ⬜ Deferred post-Accelerator PMF |

**Invariant:** Agents **recommend and orchestrate**; humans **approve** high-impact actions (see USP).

---

## Phase 6 — Enterprise operational intelligence (6–10 weeks)

**Goals**

- Predictive operational intelligence
- Delivery velocity and governance maturity analysis
- Unified operational intelligence graph
- Executive dashboards (CTO / CIO)

**Outputs**

- Predictive operational intelligence platform

**Repo alignment**

| Item | Status |
|------|--------|
| Enterprise dashboard KPIs | ✅ Partial |
| Unified ops graph + predictive layer | ⬜ |

---

## Phase 7 — Controlled automation (8–12 weeks)

**Goals**

- Low-risk AI operational automation
- AI ticket creation, workflow summarization
- Telemetry analysis and recommendations
- **Production changes remain human-governed**
- Foundation for semi-autonomous operations

**Outputs**

- Human-governed AI operational automation

**Invariant:** This phase does **not** mean unattended production deploys. It expands safe automation under governance gates.

---

## Core enterprise workflow

End-to-end flow the platform must support:

```
Telemetry collection
    → Deployment analysis
    → QA intelligence analysis
    → Regression risk analysis
    → Observability correlation
    → AI risk recommendation
    → Governance approval workflow
    → Human decision
    → Controlled release
```

Every feature should trace to a step in this chain or to platform modules below.

---

## Core enterprise modules

| Module | Phase(s) |
|--------|----------|
| Authentication & RBAC | 1 |
| Integration hub | 1–2 |
| Observability intelligence layer | 2 |
| Release governance engine | 3 |
| QA intelligence engine | 4 |
| Human approval center | 3, 5, 7 |
| Operational dashboards | 2, 4, 6 |
| Audit & compliance engine | 3 |
| Agentic workflow runtime | 5 |
| AI recommendation engine | 5 |

---

## Recommended technology stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js, React, Tailwind CSS, shadcn/ui, Framer Motion |
| **Backend** | FastAPI, Node.js, PostgreSQL, Redis |
| **AI orchestration** | LangGraph, OpenAI Agents SDK, CrewAI |
| **Workflow runtime** | Temporal.io |
| **Observability** | Grafana, Prometheus, OpenTelemetry, Loki |
| **AI observability** | LangSmith, Helicone |
| **Infrastructure** | Docker, Kubernetes, AWS, Cloudflare |

**Current repo (MVP):** Next.js 16, React 19, Prisma + SQLite, Tailwind v4 — treat as Phase 0–1 scaffold; plan migration paths for PostgreSQL, Redis, and workflow runtimes per phase gates.

---

## Final platform positioning

AIDOS is the **governance and operational intelligence layer** for enterprise AI-native delivery systems.

The platform combines:

- AI governance
- QA intelligence
- Operational telemetry
- Observability correlation
- Delivery intelligence
- Explainable AI
- Governance-aware orchestration
- Human-governed AI operations
- Enterprise operational intelligence

**Core positioning line:**

> *The Governance & Operational Intelligence Layer for Enterprise AI-Native Delivery Systems.*

(Same family as [`AIDOS-USP.md`](./AIDOS-USP.md) — use one canonical line on the website; see USP doc for audience variants.)

---

## Building new work — checklist

Before shipping a feature, epic, or page:

1. Which **phase** and **module** does it belong to?
2. Does it strengthen **govern / observe / orchestrate** (USP), not “another agent”?
3. Does it fit the **core enterprise workflow**?
4. Are **human approval** and **audit** considered for production impact?
5. Does copy match **enterprise positioning**, not generic AI hype?

---

## Related documents

- [`AIDOS-USP.md`](./AIDOS-USP.md) — why we build this (differentiation & moat)
- [`MVP-DEVELOPMENT-PLAN.md`](./MVP-DEVELOPMENT-PLAN.md) — Accelerator wedge & near-term sprints
- [`marketing-competitive-research.md`](./marketing-competitive-research.md) — competitive context
- [`source/AIDOS_Enterprise_Implementation_Roadmap.docx`](./source/AIDOS_Enterprise_Implementation_Roadmap.docx) — original Word export

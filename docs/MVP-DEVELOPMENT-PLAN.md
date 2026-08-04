# AIDOS MVP Development Plan — MVP Accelerator Focus

**Last updated:** 2026-05-17  
**Primary wedge:** **MVP Delivery Accelerator** (startup & innovation teams)  
**Supporting layer:** Discovery, Delivery DNA, human governance  

---

## 1. Executive summary

AIDOS MVP is led by the **MVP Delivery Accelerator pack**:

> **Idea → PRD → Architecture → Features → Jira epics → QA plan → Deployment plan → Human approval**

Governance (Discovery, Delivery DNA, approvals) wraps the accelerator so enterprises trust AI output before execution.

**Core loop to prove:**

> **Capture idea → Generate MVP package → Approve → Hand off to engineering**

---

## 2. Business model (Accelerator wedge)

| Element | Choice |
|---------|--------|
| **ICP** | Startup founders, innovation teams, internal incubators |
| **Wedge** | MVP Accelerator (fast idea → shippable plan) |
| **Expansion** | Same orgs add governance + DevOps/QA packs later |
| **Pricing (pilot)** | Free pilot → $299–999/mo per team or per MVP project |
| **Buyer** | Founder, Head of Product, Engineering lead |
| **30-day proof** | ≥1 approved MVP package per org; time-to-package &lt; 30 min |

### Value proposition

| Pain | AIDOS promise |
|------|----------------|
| Weeks to write PRD + epics | One-click governed package from idea |
| Disconnected Jira/GitHub | Epics structured for import; integrations next |
| Fear of blind AI | **Approve** before any execution |

---

## 3. BRD workflow (Accelerator)

```
Idea input
    ↓
AI product context (Delivery DNA)
    ↓
PRD generation
    ↓
Architecture generation
    ↓
Feature breakdown
    ↓
Jira epic creation
    ↓
QA planning
    ↓
Deployment planning
    ↓
Human approval  ← required
    ↓
Engineering execution (out of MVP auto-exec)
```

---

## 4. Implementation status

### MVP Accelerator ✅ (built)

- [x] `AcceleratorProject` model
- [x] Idea intake form (`/accelerator/new`)
- [x] Project list (`/accelerator`)
- [x] Full package generation (`POST .../generate`)
- [x] PRD, architecture, features, Jira epics, QA, deploy, roadmap
- [x] Human approval (`POST .../approve`)
- [x] Audit + activity events
- [x] Nav + dashboard CTA + onboarding steps

### Platform foundation ✅

- [x] Auth, discovery, Delivery DNA, recommendations, approvals
- [x] GitHub OAuth (partial)
- [x] Slack multi-tenant assistant channel (Mastra Channels + governed Q&A) — see [`slack-integration.md`](./slack-integration.md)

### Accelerator — next ⬜

- [ ] Export Jira epics as CSV / JSON download
- [ ] Optional OpenAI enrichment (BYOK) for richer PRD
- [ ] Push approved epics to Jira API (Assist mode, post-approval)
- [ ] MVP project templates (B2B SaaS, mobile app, API product)
- [ ] Duplicate / iterate on approved MVP

### Deferred (post-Accelerator PMF)

- QA Intelligence pack, DevOps pack, Temporal, multi-agent runtime

---

## 5. Sprint plan (Accelerator-first)

### Sprint A0 — Foundation ✅

Discovery, DNA, governance UI, agent team.

### Sprint A1 — Accelerator core ✅

MVP Accelerator pages + generation engine + approval.

### Sprint A2 — Export & polish (current)

| Task | Agent | Done when |
|------|-------|-----------|
| Jira export JSON/CSV | `/backend` | Download from project page |
| Copy-to-clipboard per artifact | `/frontend` | PRD + architecture |
| Regenerate single section | `/backend` | PATCH step without full regen |
| Architect review | `/architect` | Review doc in `docs/reviews/` |

### Sprint A3 — Jira push (Assist)

| Task | Agent |
|------|-------|
| Jira OAuth | `/backend` |
| `POST .../accelerator/[id]/push-jira` after APPROVED | `/backend` |
| UI: “Push to Jira” button | `/frontend` |

### Sprint A4 — LLM upgrade (optional)

| Task | Agent |
|------|-------|
| `OPENAI_API_KEY` BYOK | `/backend` |
| Fallback to rule engine | `/backend` |

---

## 6. Pages & APIs (Accelerator)

| Route | Status |
|-------|--------|
| `/accelerator` | ✅ |
| `/accelerator/new` | ✅ |
| `/accelerator/[id]` | ✅ |
| `GET/POST /api/accelerator` | ✅ |
| `POST /api/accelerator/[id]/generate` | ✅ |
| `POST /api/accelerator/[id]/approve` | ✅ |
| `GET /api/accelerator/[id]/export` | ⬜ A2 |

---

## 7. Multi-agent usage

```
/orchestrator Execute Sprint A2 from MVP-DEVELOPMENT-PLAN.md (Accelerator focus)

/backend Add Jira CSV export for accelerator projects

/frontend Add export buttons on accelerator project page

/architect Review MVP Accelerator approval and tenancy
```

---

## 8. Success metrics

| Metric | Target |
|--------|--------|
| Time idea → full package | &lt; 5 minutes |
| Time package → approved | &lt; 48 hours (human) |
| Pilot orgs with ≥1 approved MVP | 3 in 30 days |
| Regeneration rate (quality signal) | &lt; 30% |

---

## 9. Related docs

- [AIDOS-USP.md](./AIDOS-USP.md) — canonical positioning
- [AIDOS-ENTERPRISE-ROADMAP.md](./AIDOS-ENTERPRISE-ROADMAP.md) — enterprise Phases 0–7 (platform this wedge expands into)
- [AGENT-WORKFLOW.md](./AGENT-WORKFLOW.md)
- [../AGENTS.md](../AGENTS.md)
- [../README.md](../README.md)

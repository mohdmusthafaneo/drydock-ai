# AIDOS — AI Delivery Intelligence Platform (MVP)

Human-governed AI delivery orchestration with **MVP Accelerator**: idea → PRD → architecture → Jira epics → QA & deploy plans → human approval.

**MVP plan:** [docs/MVP-DEVELOPMENT-PLAN.md](./docs/MVP-DEVELOPMENT-PLAN.md) — scope, sprints, status checklist, and agent assignments.

## Quick start

```bash
cd ~/Projects/aidos
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, complete **Discovery**, then **MVP Accelerator** → **New MVP project** → **Generate full MVP package** → **Approve**.

## MVP scope (Phase 1 wedge)

- Multi-tenant auth (email/password, JWT session)
- Organization discovery wizard → Delivery DNA generation
- Dashboard with KPIs, recommendations panel, activity feed
- Recommendations center (rule-based AI, explainable)
- Approval center (approve / reject / modify — no auto-execution)
- Integration stubs (GitHub, Jira, Grafana, Slack)

## Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend:** Next.js API routes
- **Database:** SQLite (Prisma) — swap to Postgres for production

## Multi-agent development

AIDOS uses Cursor subagents for parallel specialist work:

| Agent | Command | Focus |
|-------|---------|--------|
| Frontend | `/frontend` | UI, components, pages |
| Backend | `/backend` | APIs, Prisma, auth, domain logic |
| Architect | `/architect` | Read-only design & BRD review |
| Orchestrator | `/orchestrator` | Plan and coordinate the above |

See [AGENTS.md](./AGENTS.md) and [docs/AGENT-WORKFLOW.md](./docs/AGENT-WORKFLOW.md).

## Project structure

```
src/
  app/(platform)/     # Authenticated app shell
  app/api/            # Auth, discovery, approvals, integrations
  components/         # UI, discovery wizard, approvals
  lib/                # Prisma, auth, Delivery DNA engine
  generated/prisma/   # Prisma client
```

## GitHub OAuth (optional)

1. Create a GitHub OAuth App: https://github.com/settings/developers  
2. **Callback URL:** `http://localhost:3000/api/integrations/github/callback`  
3. Add to `.env`:

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Open **Integrations** → **Connect with GitHub**

Without these vars, use **Connect (dev stub)** for local testing.

Architecture review: [docs/reviews/2026-05-17-github-oauth-architecture-review.md](./docs/reviews/2026-05-17-github-oauth-architecture-review.md)

## Environment

| Variable       | Description                          |
|----------------|--------------------------------------|
| `DATABASE_URL` | SQLite path (default in `.env`)      |
| `AUTH_SECRET`  | JWT signing secret (32+ chars prod)  |
| `NEXT_PUBLIC_APP_URL` | App URL for OAuth callbacks   |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID     |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret          |

## Roadmap

See the full phased plan in **[docs/MVP-DEVELOPMENT-PLAN.md](./docs/MVP-DEVELOPMENT-PLAN.md)** (business model, sprints, exit criteria, BRD mapping).

**Current focus (Sprint A2):** MVP Accelerator export (Jira CSV/JSON) + artifact copy + architect review.

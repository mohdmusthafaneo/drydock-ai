# AIDOS — Agent Team

**MVP development plan:** [docs/MVP-DEVELOPMENT-PLAN.md](docs/MVP-DEVELOPMENT-PLAN.md) — sprints, scope, status checklist, metrics.

This project uses **Cursor subagents** for specialized development. Invoke them with `/name` in Agent chat or ask the parent agent to delegate.

## Agent roster

| Agent | Command | Role |
|-------|---------|------|
| **Orchestrator** | `/orchestrator` | Plans features, splits work, coordinates others |
| **Frontend** | `/frontend` | UI, components, pages, Tailwind, client flows |
| **Backend** | `/backend` | API routes, Prisma, auth, Delivery DNA engine |
| **Architect** | `/architect` | Read-only reviews — BRD alignment, contracts, security |

Config files: `.cursor/agents/*.md`

## Recommended workflow

### New feature

```
/orchestrator Plan [feature name] with API contract and acceptance criteria

/backend Implement API and schema per contract

/frontend Wire UI, loading/error states, mobile nav

/architect Review [feature] end-to-end before we merge
```

### Single-domain task

```
/frontend Add release readiness widget to dashboard
/backend Add webhook endpoint for Jira sync (stub)
/architect Review multi-tenant isolation on approvals API
```

### Parallel (only after contract is frozen)

```
/backend and /frontend work in parallel on the GitHub OAuth slice —
contract: POST /api/integrations/github/callback, session required
```

## Ownership map

```
src/
  app/(platform)/     → frontend
  app/api/            → backend
  components/         → frontend
  lib/                → backend (domain); frontend may import types only
  generated/prisma/   → backend (generated)
prisma/               → backend
```

## Product guardrails (all agents)

1. **Human-governed** — humans approve before any automated action.
2. **Phase 1 wedge first** — discovery, DNA, recommendations, approvals before QA/DevOps packs.
3. **No agent chaos** — one orchestrated flow; architect catches scope creep.
4. **Enterprise trust** — audit logs, explainable recommendations, org isolation.

## Design reference

- Colors & UX: see `.cursor/agents/frontend.md`
- Data model: `prisma/schema.prisma`
- BRD source: user-provided enterprise BRD documents (AIDOS vision)

## Verify before done

```bash
npm run build
npx prisma migrate dev   # if schema changed
npm run dev              # manual: signup → discovery → DNA → approvals
```

## Next.js note

<!-- BEGIN:nextjs-agent-rules -->
This is NOT the Next.js you know. Read `node_modules/next/dist/docs/` before changing Next.js APIs.
<!-- END:nextjs-agent-rules -->

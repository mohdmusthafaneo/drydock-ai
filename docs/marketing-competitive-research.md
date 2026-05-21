# AIDOS Marketing — Competitive Research & Feature Prioritization

*Informed by [Portkey.ai](https://portkey.ai/) positioning and the [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) structure (hero → proof → capabilities → workflow → trust → CTA).*

## Market landscape

| Player | Primary focus | Overlap with AIDOS | Gap vs AIDOS |
|--------|---------------|-------------------|--------------|
| **Portkey** | LLM gateway, observability, guardrails, prompt mgmt | Governance, observability, audit, RBAC | Model routing & token ops — not delivery/SDLC |
| **Harness / OpsLevel** | CI/CD, SRE, service catalog | Release/deploy signals, DevOps | Weak on AI planning, MVP acceleration, human-in-loop AI |
| **Jellyfish / LinearB** | Engineering metrics & DORA | Delivery intelligence dashboards | Not release-governance or AI-generated delivery artifacts |
| **Cortex / Backstage** | Developer portals & scorecards | Platform health, integrations | No end-to-end assess → approve → deploy with QA agents |
| **GitHub Copilot / Cursor** | Code & task AI | AI-assisted delivery | No org DNA, approval gates, audit, or enterprise workflow |
| **Jira + Atlassian Intelligence** | Work tracking + AI | Epics, approvals | No unified readiness score, telemetry correlation, or MVP package |

## AIDOS unique selling propositions (USP)

**Canonical source:** `docs/AIDOS-USP.md` (Governance-Aware Agentic Operational Intelligence).

Summary for marketing prioritization:

1. **Governance-first operational intelligence** — Govern first, automate safely (*vs automate first, govern later*).
2. **Human-governed AI operations** — AI proposes; humans approve. Nothing deploys without an explicit gate.
3. **Unified layer** — AI governance + telemetry + QA + deployment + observability + orchestration in one place.
4. **Agentic workflow governance** — Scale thousands of AI workflows with policy, audit, and visibility.
5. **Delivery DNA** — Org context shapes recommendations and artifacts (MVP/incubation workspace in-product).

## Prioritized capabilities (website & product narrative)

### P0 — Hero & above-the-fold (must showcase)

| Capability | Message |
|------------|---------|
| Human-governed AI | Trust headline: *AI proposes. You decide.* |
| Approval center | Impact-scored recommendations and release gates |
| Enterprise governance cockpit | Governance score, workflow center, approval center |
| Release pipeline | Assess → approve → controlled deploy |

### P1 — Mid-page proof (differentiation)

| Capability | Message |
|------------|---------|
| QA intelligence | Readiness index, regression & coverage signals |
| Observability & incidents | Telemetry, error rate, P95, correlated incidents |
| Audit & compliance | Exportable audit trail, RBAC |
| Integrations | GitHub, Jira, Grafana, Prometheus, Slack |

### P2 — Footer / depth (credibility)

| Capability | Message |
|------------|---------|
| Agent registry | Orchestrator + specialized agents, progressive autonomy |
| Reports & analytics | Governance health, delivery confidence |
| DevOps intelligence | Rollback recommendations, deployment health |

## Positioning statement (copy-ready)

> **AIDOS** is the production stack for **AI delivery teams** — human-governed intelligence from first idea to safe release, with observability and audit built in.

**For enterprises:** Run Phase 2 operational intelligence — QA, observability, and release governance without losing human control.

## Portkey-inspired site map (implemented template)

| Section | Portkey analog | AIDOS content |
|---------|----------------|---------------|
| Nav + CTA | Product, Pricing, Sign up | Capabilities, Platform, Sign up / Dashboard |
| Hero | Production stack for Gen AI | Production stack for AI delivery teams |
| Stats bar | Tokens, stars, models | Releases assessed, approvals, integrations |
| Feature grid | Gateway, Observability, Guardrails | Enterprise pillars, QA, Observability |
| Workflow | AI Gateway pattern | Governed delivery loop |
| Trust | RBAC, audit, PII | Approvals, audit logs, Delivery DNA |
| Integrations | Logo wall | GitHub, Jira, Grafana, Prometheus, Slack |
| CTA | Book demo | Start free / Open dashboard |

## Recommended next steps (post-template)

- Add `/pricing` and `/customers` when GTM is ready
- Record product screenshots for hero mock (replace placeholder UI frame)
- Split marketing to `www` subdomain if app moves to `app.aidos.*`

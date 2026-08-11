# QA Onboarding Tracker — AIDOS Live

> **Purpose:** Single source of truth for the QA onboarding guide. If the agent is lost, restart from the top of this file and continue from the last `Last completed:` entry.

## Agent identity
- Role: new QA onboarded to AIDOS
- App: https://live.neoitotech.in
- Account: `connexus@neoito.com` / `Password@123`
- Org in scope: **Connexus**

## Product context (from repo docs)
- AIDOS = **Governance-Aware Agentic Operational Intelligence**.
- One-liner: "AIDOS governs, observes, and orchestrates enterprise AI operations."
- Human-in-the-loop: AI recommends, humans approve. No autonomous execution.
- Phase 1 of 7 is shipping on this org: enterprise core platform shell.
- MVP wedge: MVP Delivery Accelerator (idea → PRD → arch → features → Jira epics → QA plan → deploy plan → human approval).
- Active integrations on Connexus: Jira + GitHub. Cloud-hygiene + code-risk + productivity agents are stale (8–12 days).
- Artifacts saved under `/Users/musthafa/projects/AIDOS/qa-onboarding/`.
## Page map (from `src/app/(platform)/**`)
| Route | Purpose (per docs) |
|---|---|
| `/dashboard` | Today: executive briefing, delivery confidence, what needs attention, early warnings |
| `/delivery-analysis` | Backlog & sprint detail for delivery lead |
| `/integrations` | Connectors (Jira, GitHub, Grafana, Slack) and health |
| `/approvals` | Approval center for AI proposals |
| `/governance` / `/governance/setup` / `/governance/policy` / `/governance/workflow` / `/governance/toolchain-mapping` | Governance foundation |
| `/delivery-dna` | Delivery DNA profile |
| `/discovery` | Discovery wizard |
| `/accelerator` | MVP Accelerator list / `/new` / `/[id]` |
| `/agent-threads` | Ask AIDOS / agent conversations |
| `/incidents` / `/incidents/[id]` | Incident tracking |
| `/releases` / `/releases/new` / `/releases/[id]` | Release governance |
| `/qa` | QA posture detail |
| `/devops` | Cloud hygiene findings |
| `/productivity` | Commit velocity & contributors |
| `/code-analysis` | Code & contributor activity |
| `/code-health` | Code change risk |
| `/observability` | Observability view |
| `/recommendations` | Recommendations center |
| `/workflow` | Workflow view |
| `/reports` | Reports |
| `/admin` | Admin |
| `/settings` | Settings |
| `/audit` | Audit log |
| `/activate` | Activation |

## Section list for the final guide
1. Login & session
2. Sidebar / navigation
3. Dashboard (Today page)
4. Integrations hub
5. Delivery DNA
6. Discovery wizard
7. MVP Accelerator
8. Delivery analysis
9. Releases
10. Approvals
11. Governance (setup, policy, workflow, toolchain mapping)
12. QA, DevOps, Productivity, Code analysis, Code health
13. Recommendations
14. Agent threads (Ask AIDOS)
15. Incidents
16. Reports, Audit, Settings, Admin
17. Open questions for product owner

## Walkthrough progress

| # | Area | Status | Screenshots | Notes |
|---|---|---|---|---|
| 1 | Login | done | 01-login.webp | OK |
| 2 | Sidebar / nav | done | (in 02 onwards) | Hexagon icon has no label — Q65 |
| 3 | Dashboard (Today) | done | 02, 02b, 02c, 02d, 02e | 4 shots; long page |
| 4 | Integrations | done | 03, 03b, 03c, 03d, 03e | 5 shots; GitHub connected, AWS/Grafana/Prom disconnected |
| 5 | Delivery DNA | done | 04, 04b | Renders at /governance |
| 6 | Discovery | done | 05, 24, 24b | 3 steps; 05 is the redirect capture |
| 7 | MVP Accelerator | blocked | — | Redirects to /dashboard for ENTERPRISE orgs — Q4 |
| 8 | Delivery analysis | done | 07, 07b, 07c, 07d | 4 shots; signal board expanded |
| 9 | Releases | done | 17, 17b, 30, 30b, 30c, 30d, 30e, 30f | 8 shots; ran assessment end-to-end |
| 10 | Approvals | done | 08, 08b | Empty state + system events expanded |
| 11 | Governance | done | 25, 26, 27, 27b | policy/workflow/toolchain |
| 12 | QA / DevOps / Productivity / Code | done | 10, 11, 11b, 12, 13, 14 | 6 shots |
| 13 | Recommendations | done | 09, 09b | 2 shots |
| 14 | Agent threads | done | 15, 29, 29b | list + new + open thread |
| 15 | Incidents | done | 16, 31, 31b | list + detail |
| 16 | Reports / Audit / Settings / Admin / Observability / Activate / Workflow | done | 18, 19, 20, 21, 22, 23, 28 | Some routes redirect; captured the redirect |
| 17 | Questions to product owner | done | (in QUESTIONS-FOR-PO.md) | 70 questions across 14 categories |
| 18 | Guide written | done | (QA-ONBOARDING-GUIDE.md) | 19 sections |

## Last completed:
- Guide written (`QA-ONBOARDING-GUIDE.md`), questions list written (`QUESTIONS-FOR-PO.md`), 60 screenshots saved to `./screenshots/`.
- Final open ask: have the PO answer Q1, Q2, Q4, Q5, Q10, Q29, Q31, Q62, Q63 first.

---

## Drive round 2026-08-11 (interaction pass)

| # | Action | Result | Findings |
|---|---|---|---|
| T1 | Sync Jira data | API 400 surfaced raw JSON to user | D-10, D-11, D-12 |
| T2 | Tour Connect wizards (Grafana, Prometheus, AWS) | All captured. AWS already connected. Jenkins "Coming soon" but banner says "3 disconnected" | D-13, D-14, D-15, D-16, D-17 |
| T3 | Create new release `QA-Drive Test Release` | Form gave "Invalid release data" with no field hint; succeeded with `branch=main` | D-18, D-19 |
| T4 | Run assessment | NO-GO, 0% readiness, 53% governance risk. Banner shows CUID, H1 shows name. | D-20, D-21, D-22 |
| T5 | Ask AIDOS: "QA blockers for our most recent release" | Full structured reply; **picked wrong release** (Sprint 37 over the new one) | D-23, D-24 |
| T6 | Update incident (status → Investigating) | Saved via DOM workaround. No toast. | D-25, D-26 |
| T7 | Act on a recommendation | Approval Center "Approve the hold" worked. OPS recommendations have no in-app actions. | D-27, D-28 |
| T8 | Audit log + Settings + team invite | All clean. Invite link has `name=local-part`. | D-29, D-30, D-31 |

**Total findings this round:** 31 (D-01 .. D-31) appended to `FINDINGS-LOG.md`.
**Total new screenshots:** 27 (IA-01 .. IA-27).
**Total questions for PO now:** 87 (added Q71-Q87 from drive round).


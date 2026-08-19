# Screenshots Index — AIDOS QA Onboarding

> All screenshots from the two QA passes (walk + drive). 87 files in `screenshots/`. Two naming schemes:
> - `NN-...webp` — walk pass, 2026-08-10
> - `IA-NN-...png` — drive round, 2026-08-11

## Walk pass — 2026-08-10

### Login
- `01-login.webp` — login page

### Today (Dashboard) — 5 shots, page is ~4000px tall
- `02-dashboard-today.webp` — top (executive briefing, KPIs)
- `02b-dashboard-bottom.webp` — full page bottom attempt
- `02c-dashboard-mid1.webp` — middle 1 (what needs attention, early warnings)
- `02d-dashboard-mid2.webp` — middle 2 (delivery confidence 5-axis)
- `02e-dashboard-mid3.webp` — middle 3 (waiting on leadership, delegate the detail)

### Connect (Integrations) — 5 shots
- `03-integrations.webp` — top
- `03b-integrations-mid1.webp` — middle 1 (GitHub repos + Jira setup)
- `03c-integrations-mid2.webp` — middle 2 (Jira + Slack)
- `03d-integrations-mid3.webp` — middle 3 (Grafana, Prometheus, AWS)
- `03e-integrations-mid4.webp` — bottom

### Delivery DNA & Discovery — 6 shots
- `04-delivery-dna.webp` — DNA top
- `04b-delivery-dna-mid.webp` — DNA middle (Policy + Discovery)
- `05-discovery.webp` — Discovery (redirect capture)
- `06-governance.webp` — Governance page
- `24-governance-setup.webp` — Governance setup wizard
- `24b-discovery-step2.webp` — Discovery step 2

### Delivery analysis — 4 shots
- `07-delivery-analysis.webp` — top
- `07b-delivery-analysis-mid.webp` — middle
- `07c-delivery-analysis-expanded.webp` — signal board expanded
- `07d-delivery-analysis-deeper.webp` — deeper

### Approvals — 2 shots
- `08-approvals.webp` — list
- `08b-approvals-system-events.webp` — system events expanded

### Recommendations — 2 shots
- `09-recommendations.webp` — top
- `09b-recommendations-mid.webp` — middle

### Investigate views (QA / DevOps / Productivity / Code) — 6 shots
- `10-qa.webp` — QA posture
- `11-devops.webp` — DevOps top
- `11b-devops-mid.webp` — DevOps middle
- `12-productivity.webp` — Productivity
- `13-code-analysis.webp` — Code analysis
- `14-code-health.webp` — Code health

### Agent threads — 3 shots
- `15-agent-threads.webp` — list
- `29-agent-thread-new.webp` — new thread (suggested prompts)
- `29b-agent-thread-detail.webp` — open thread conversation

### Incidents — 3 shots
- `16-incidents.webp` — list
- `31-incident-detail.webp` — detail top
- `31b-incident-detail-lower.webp` — detail lower (remediation form)

### Releases — 8 shots
- `17-releases.webp` — list
- `17b-releases-new.webp` — new release form
- `30-release-detail.webp` — release detail (CUID H1)
- `30b-release-detail-lower.webp` — same scrolled
- `30c-release-after-assessment.webp` — after running assessment
- `30d-release-assessment-mid.webp` — assessment mid
- `30e-signal-details.webp` — 13 signal details expanded
- `30f-release-bottom.webp` — regression intelligence footer

### Governance surfaces — 5 shots
- `25-governance-policy.webp` — policy
- `26-governance-workflow.webp` — workflow
- `27-governance-toolchain.webp` — toolchain mapping top
- `27b-toolchain-mid.webp` — toolchain mid

### Supporting pages — 7 shots
- `18-observability.webp` — observability (redirect)
- `19-workflow.webp` — workflow
- `20-reports.webp` — reports (redirect)
- `21-audit.webp` — audit
- `22-settings.webp` — settings
- `23-admin.webp` — admin (redirect)
- `28-activate.webp` — activate (redirect)

---

## Drive round — 2026-08-11 (interaction pass)

### Discovery wizard (T1 prerequisite)
- `IA-01-discovery-step1.png` — step 1 with new industry/team
- `IA-02-discovery-step2-finance.png` — step 2 after Finance + 51-200
- `IA-02b-discovery-step2-soc2.png` — step 2 after SOC 2 + Manual approval gates
- `IA-03-discovery-review.png` — Review step summary

### Dashboard post-DNA regen
- `IA-04-dashboard-after-DNA-regen.png` — delivery confidence 30, HOLD recommendation

### Connect (T1, T2)
- `IA-05-jira-toggle-ai.png` — Jira project picker with AI+CX toggled
- `IA-06-jira-syncing.png` — Jira sync in-flight
- `IA-07-jira-sync-error.png` — Jira sync error (literal 400 JSON to user)
- `IA-08-connect-grid.png` — Connect grid with all 4 categories
- `IA-09-grafana-wizard.png` — Grafana configure wizard expanded
- `IA-10-prometheus-wizard.png` — Prometheus wizard with Connection mode
- `IA-11-aws-panel.png` — AWS assume-role panel (already connected)
- `IA-12-jenkins-coming-soon.png` — Jenkins "Coming soon" — banner says 3 disconnected

### Release flow (T3, T4)
- `IA-13-release-form.png` — filled register form
- `IA-14-release-invalid.png` — "Invalid release data" error
- `IA-15-release-created.png` — new release detected
- `IA-16-release-assessed.png` — top of assessed release
- `IA-17-release-gate-brief.png` — gate brief (NO-GO 0% readiness)
- `IA-18-regression-intel.png` — regression intelligence section

### AIDOS reply (T5)
- `IA-19-aidos-prompt.png` — AIDOS prompt submitted
- `IA-20-aidos-response.png` — AIDOS structured reply (thought tag, blockers, recommended actions)

### Incident (T6)
- `IA-21-incident-edit.png` — incident edit form
- `IA-22-incident-updated.png` — status pill INVESTIGATING

### Approvals (T7)
- `IA-23-approved.png` — Approved Hold in Decision history

### Recommendations (T7)
- `IA-24-recs-why.png` — "Why this matters" expanded

### Audit / Settings / Follow-up
- `IA-25-audit.png` — audit log (50 events)
- `IA-26-settings.png` — settings + team management
- `IA-27-invite.png` — invite share link generated
- `IA-28-dashboard-postdrive.png` — dashboard after drive (29 confidence, QA-Drive Test Release mentioned, 1 incident alert)
- `IA-29-audit-all-filters.png` — audit log all events filter (counter stale D-33)
- `IA-30-audit-releases.png` — audit log Releases filter

---

**Total: 87 files, 1.8 MB.** All stored in `qa-onboarding/screenshots/`.

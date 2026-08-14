# Discovery Wizard Field Usage Audit

**Ticket:** TKT-019a
**Date:** 2026-08-14
**Worktree:** `/Users/musthafa/projects/aidos-tkt019a`

---

## Summary Table

| Field | Wizard Step | Downstream Usage | Status |
|-------|-------------|-----------------|--------|
| `industryType` | Step 1 | `generateDeliveryDNA()` → governance score, workflow mode, DNA summary text; profile display | **used** |
| `teamSize` | Step 1 | `generateDeliveryDNA()` → `workflowMode` ("lean-mvp" / "scaled-agile" / "enterprise-governed"); profile display | **used** |
| `sdlcMaturity` | Step 2 | `generateDeliveryDNA()` → `avgMaturity`, `approvalLevel`, `riskThreshold`, `autonomyMode`; profile display | **used** |
| `devopsMaturity` | Step 2 | `generateDeliveryDNA()` → `avgMaturity`, `governanceScore`; profile display | **used** |
| `governanceLevel` | Step 2 | `generateDeliveryDNA()` → `approvalLevel`, `riskThreshold`, `autonomyMode`, `governanceScore`; profile display | **used** |
| `complianceType` | Step 1 | `generateDeliveryDNA()` → `governanceScore` (+10 if not "none"); profile display | **used** |
| `deploymentStrategy` | Step 1 | `generateDeliveryDNA()` → `observabilityStrategy`; `mvp-accelerator.ts` → `buildArchitecture()`; profile display | **used** |
| `tools` | Step 1 | Persisted to `toolsJson` column via `api/discovery/route.ts`; NOT consumed in DNA generation | **unused-but-shown** |
| `workflows` | Step 1 | Persisted to `workflowsJson` column via `api/discovery/route.ts`; NOT consumed in DNA generation | **unused-but-shown** |

---

## Detailed Findings

### `industryType`
- **Wizard location:** Step 1 (Basics), `<select id="industryType">`
- **Options:** technology, finance, healthcare, retail, manufacturing, other
- **Downstream:**
  - `delivery-dna.ts:generateDeliveryDNA()` — drives `governanceScore` (complianceType !== "none" ? 10 : 0), `workflowMode` summary text
  - `governance/setup/page.tsx` — pre-fill source
  - `api/discovery/route.ts` — persisted to `DeliveryDNA.industryType`
- **Verdict:** used

### `teamSize`
- **Wizard location:** Step 1 (Basics), `<select id="teamSize">`
- **Options:** 1-10, 11-50, 51-200, 201-1000, 1000+
- **Downstream:**
  - `delivery-dna.ts:generateDeliveryDNA()` — determines `workflowMode`:
    - "1-10" → lean-mvp
    - "11-50" → scaled-agile
    - others → enterprise-governed
  - `api/discovery/route.ts` — persisted
- **Verdict:** used

### `sdlcMaturity`
- **Wizard location:** Step 2 (Advanced), `<select id="sdlcMaturity">`
- **Options:** 1–5 scale
- **Downstream:**
  - `delivery-dna.ts:generateDeliveryDNA()` — `avgMaturity = (sdlcMaturity + devopsMaturity + governanceLevel) / 3`; feeds `autonomyMode` and `governanceScore`
  - `governance/page.tsx` — displayed in profile panel
- **Verdict:** used

### `devopsMaturity`
- **Wizard location:** Step 2 (Advanced), `<select id="devopsMaturity">`
- **Options:** 1–5 scale
- **Downstream:**
  - `delivery-dna.ts:generateDeliveryDNA()` — `avgMaturity` and `governanceScore` (devopsMaturity * 6)
  - `governance/page.tsx` — displayed in profile panel
- **Verdict:** used

### `governanceLevel`
- **Wizard location:** Step 2 (Advanced), `<select id="governanceLevel">`
- **Options:** 1–5 scale
- **Downstream:**
  - `delivery-dna.ts:generateDeliveryDNA()` — `approvalLevel = min(5, max(1, 6 - governanceLevel))`; `riskThreshold = min(0.9, max(0.2, 1 - governanceLevel * 0.12))`; `avgMaturity`; `governanceScore` (governanceLevel * 18)
  - `governance/page.tsx` — displayed in profile panel
- **Verdict:** used

### `complianceType`
- **Wizard location:** Step 1 (Basics), `<select id="complianceType">`
- **Options:** none, soc2, hipaa, gdpr, iso27001
- **Downstream:**
  - `delivery-dna.ts:generateDeliveryDNA()` — `governanceScore` formula adds 10 when `complianceType !== "none"`
  - `governance/page.tsx` — displayed as compliance badge
- **Verdict:** used

### `deploymentStrategy`
- **Wizard location:** Step 1 (Basics), `<select id="deploymentStrategy">`
- **Options:** continuous, periodic, manual
- **Downstream:**
  - `delivery-dna.ts:generateDeliveryDNA()` — drives `observabilityStrategy` summary
  - `mvp-accelerator.ts:buildArchitecture()` — passed as `deploy` param
  - `governance/page.tsx` — displayed in profile panel
- **Verdict:** used

### `tools`
- **Wizard location:** Step 1 (Basics), checkbox list
- **Options:** github, jira, slack, pagerduty, grafana, prometheus
- **Downstream:**
  - `api/discovery/route.ts` — persisted as `toolsJson`
  - `delivery-dna.ts:generateDeliveryDNA()` — NOT referenced
  - `mvp-accelerator.ts` — NOT referenced
  - `governance/page.tsx` — NOT displayed
- **Verdict:** unused-but-shown

### `workflows`
- **Wizard location:** Step 1 (Basics), checkbox list
- **Options:** scrum, kanban, devops, waterfall, xp
- **Downstream:**
  - `api/discovery/route.ts` — persisted as `workflowsJson`
  - `delivery-dna.ts:generateDeliveryDNA()` — NOT referenced
  - `mvp-accelerator.ts` — NOT referenced
  - `governance/page.tsx` — NOT displayed
- **Verdict:** unused-but-shown

---

## DNA Generation Logic (delivery-dna.ts)

```
avgMaturity     = (sdlcMaturity + devopsMaturity + governanceLevel) / 3
approvalLevel   = clamp(1, 5, 6 - governanceLevel)
riskThreshold   = clamp(0.2, 0.9, 1 - governanceLevel * 0.12)
governanceScore = governanceLevel*18 + devopsMaturity*6 + (complianceType!=="none"?10:0)
autonomyMode    = lean-mvp / scaled-agile / enterprise-governed (from teamSize)
                  ASSIST if avgMaturity>=4 && governanceLevel>=4
                  RECOMMEND otherwise
workflowMode    = lean-mvp / scaled-agile / enterprise-governed (from teamSize)
```

---

## Open Issues

- **TKT-067:** Wizard still uses native `<select>` elements (not auditable via `tab.selectByLabel`)
- **TKT-019c:** No loading skeleton on Generate Delivery DNA
- **TKT-059:** No success toast on DNA save
- **TKT-021:** `sdlcMaturity` and `devopsMaturity` are user-set 1-5; per PO should be auto-derived from integrations — not implemented
- **`tools` / `workflows`:** Persisted but unused downstream. Recommend either (a) wiring into `generateDeliveryDNA()` or (b) removing from wizard until wired

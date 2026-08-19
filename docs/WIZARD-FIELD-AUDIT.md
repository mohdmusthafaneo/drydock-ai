# Discovery Wizard Field Usage Audit — TKT-080

Traces every Discovery wizard field through: storage → Delivery DNA computation → UI summary.

## Field × Pipeline Matrix

| Field | Stored | DNA Input | Affects Maturity | UI Summary | Recommendations |
|-------|--------|-----------|-----------------|------------|-----------------|
| `industryType` | ✅ `OrganizationProfile` | ✅ `generateDeliveryDNA()` | ❌ | ✅ "operates in {industry}" | ❌ |
| `teamSize` | ✅ `OrganizationProfile` | ✅ `generateDeliveryDNA()` | ❌ | ✅ "team of {size}" | ❌ |
| `sdlcMaturity` | ✅ `OrganizationProfile` | ✅ `generateDeliveryDNA()` | ✅ avgMaturity | ✅ | ✅ |
| `devopsMaturity` | ✅ `OrganizationProfile` | ✅ `generateDeliveryDNA()` | ✅ avgMaturity | ✅ | ✅ |
| `governanceLevel` | ✅ `OrganizationProfile` | ✅ `generateDeliveryDNA()` | ✅ avgMaturity | ✅ | ✅ |
| `complianceType` | ✅ `OrganizationProfile` | ✅ `generateDeliveryDNA()` | ✅ +10 pts | ✅ | ❌ |
| `deploymentStrategy` | ✅ `OrganizationProfile` | ✅ `generateDeliveryDNA()` | ❌ | ✅ | ❌ |
| `tools` | ✅ `OrganizationProfile` (JSON) | ✅ `generateDeliveryDNA()` | ❌ | ✅ displayed | ❌ |
| `workflows` | ✅ `OrganizationProfile` (JSON) | ✅ `generateDeliveryDNA()` | ❌ | ✅ displayed | ❌ |

## Detailed Trace

### Storage
`src/app/api/discovery/route.ts:11-21` — Zod schema validates all 9 fields.
`src/app/api/discovery/route.ts:38-41` — All fields packed into `answers` object.
`src/app/api/discovery/route.ts:188` — All fields written to `OrganizationProfile` via Prisma transaction.

### Delivery DNA Computation
`src/lib/delivery-dna.ts` — `generateDeliveryDNA(answers)`:
- **Maturity score**: avg(sdlcMaturity, devopsMaturity, governanceLevel) → governance score
- **Release cycle**: `6 - governanceLevel` (governance 5 → 1-week cycle; governance 1 → 5-week cycle)
- **Team cost modifier**: teamSize maps to cost multiplier (1-10: 0.5x, 11-50: 1x, 51-200: 2x, 200+: 4x)
- **Compliance overhead**: +10 pts if complianceType ≠ "none"
- **DNA score**: `governanceLevel*18 + devopsMaturity*6 + compliance overhead + team size modifier`
- **Summary narrative**: Includes industryType, workflowMode (derived from workflows), teamSize, deploymentStrategy

### UI Summary
`src/app/(platform)/delivery-dna/page.tsx` — Displays DNA summary card.
Governance presentation layer reads `OrganizationProfile` fields and renders maturity levels, tools, workflows.

### Recommendations
`src/lib/delivery-dna.ts:30` — avgMaturity drives recommendation tier:
- `< 3`: reactive
- `3-4`: proactive  
- `≥ 4 AND governanceLevel ≥ 4`: continuous improvement

`sdlcMaturity`, `devopsMaturity`, `governanceLevel` → influence which recommendations surface.

## Unused Fields
None identified. All 9 fields are consumed either in DNA score computation or UI summary.

## Changed Since TKT-019a
TKT-019b (IA) confirmed 3-step wizard (Organization → Governance → Review).
TKT-019c (loading skeleton) added.
TKT-019d (GitHub pre-select) added `getConnectedTools()` for tool pre-selection.

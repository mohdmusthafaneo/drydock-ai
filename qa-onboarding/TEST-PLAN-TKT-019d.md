# TKT-019d: Discovery Wizard — GitHub Pre-select QA Test Plan

## Feature
Auto-detect connected integrations and pre-select only those in the Discovery wizard tool checklist.

## Feature Flag
`ENABLE_CONNECTED_TOOLS_PRESELECT=1` enables the new behavior.

## Test Cases

### TC-019d-01: New org, no integrations connected
**Setup:** Fresh org, no integrations connected.
**Action:** Navigate to `/governance/setup`.
**Expected:** Tools pre-selected = `["github", "jira"]` (default fallback, flag off or on).
**Flag ON Expected:** `["github", "jira"]` (no connected tools available).

### TC-019d-02: New org, GitHub connected only
**Setup:** Org with GitHub connected (status=CONNECTED), no other integrations.
**Action:** Navigate to `/governance/setup`.
**Flag OFF Expected:** Tools pre-selected = `["github", "jira"]` (default behavior).
**Flag ON Expected:** Tools pre-selected = `["github"]` only.

### TC-019d-03: New org, GitHub + Jira connected
**Setup:** Org with GitHub and Jira both connected.
**Flag ON Expected:** Tools pre-selected = `["github", "jira"]`.

### TC-019d-04: Existing org with saved profile
**Setup:** Org that has completed discovery before (profile.completedAt set).
**Action:** Navigate to `/governance/setup`.
**Expected:** Tools pre-selected = whatever is saved in `organizationProfile.toolsJson` (existing profile takes precedence; no change to saved state regardless of flag).

### TC-019d-05: All integrations connected
**Setup:** Org with GitHub, Jira, Grafana, Prometheus, Slack all connected.
**Flag ON Expected:** All connected tool IDs pre-selected.

## Migration Notes
- Existing `organizationProfile` rows are not modified.
- Only new profiles (no `completedAt`) are affected.
- The feature flag defaults to OFF (legacy behavior preserved).
- Set `ENABLE_CONNECTED_TOOLS_PRESELECT=1` in environment to enable.

## Verification Commands
```bash
# Check pre-selected tools in UI
open http://localhost:3000/governance/setup

# Verify Integration table state
psql $DATABASE_URL -c "SELECT provider, status FROM integrations WHERE organization_id = '<test-org-id>'"
```

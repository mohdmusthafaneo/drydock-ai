# Architecture Review — GitHub OAuth Integration

**Reviewer:** Architect agent (read-only)  
**Date:** 2026-05-17  
**Feature slice:** Real GitHub OAuth connect flow (Phase 2 integration groundwork)

## Verdict

**APPROVE WITH NOTES**

## Summary

The GitHub OAuth slice correctly advances the BRD integration-first strategy with org-scoped connections, audit logging, and a clear read-only scope. The split between `/backend` (OAuth routes, state signing, token exchange) and `/frontend` (connect UI, alerts, disconnect) is clean. Token persistence is intentionally omitted from the MVP — acceptable for proving the connect loop, but required before repo intelligence features.

## Strengths

- **Multi-tenant isolation:** OAuth `state` JWT binds `organizationId`; callback verifies against session org.
- **Human-governed:** Connect/disconnect writes `AuditLog` + `ActivityEvent` — no silent automation.
- **Graceful dev fallback:** Stub connect when `GITHUB_CLIENT_ID` is unset; UI explains configuration gap.
- **No token leakage to client:** Access token used only during callback; metadata stores `githubLogin` only.
- **BRD alignment:** Read-only scope (`read:user`, `repo:status`) matches Recommend-only autonomy.

## Issues

| Severity | Area | Finding | Recommendation |
|----------|------|---------|----------------|
| High | Security | Access token discarded after callback | Add encrypted `IntegrationCredential` table before GitHub API sync |
| Medium | Security | OAuth state in query string | Acceptable for MVP; consider PKCE if making app public |
| Medium | Ops | Requires `NEXT_PUBLIC_APP_URL` match GitHub app callback | Document in README; validate on startup in dev |
| Low | UX | Other providers still stub-only | Label clearly (done); Jira OAuth next slice |
| Low | API | `disconnect` uses `updateMany` not upsert | Ensure row exists from discovery seed |

## BRD alignment

- ✅ Integration Management module (connect, status, metadata)
- ✅ Observability path: GitHub identity available for future correlation
- ✅ Enterprise trust: audit trail on connect/disconnect
- ⏳ QA/DevOps packs unchanged (correct for Phase 1 wedge)

## Suggested next steps

1. Persist encrypted GitHub token server-side for repo/PR read APIs.
2. Add Jira OAuth using the same `signOAuthState` pattern.
3. Surface “GitHub connected” on dashboard KPI strip when `integrations` includes CONNECTED GitHub.
4. E2E test: authorize → callback → integrations page shows `@login`.

## Contract reference

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/api/integrations/github/authorize` | GET | Session cookie | 302 → GitHub |
| `/api/integrations/github/callback` | GET | Session + state JWT | 302 → `/integrations?connected=github` |
| `/api/integrations/disconnect` | POST | Session | `{ ok: true }` |

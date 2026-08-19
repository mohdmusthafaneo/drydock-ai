# Defect Reports — AIDOS Live (Connexus)

> Code-grounded defect reports generated from the QA interaction drive (2026-08-11). Each defect includes reproduction steps, observed vs expected, root-cause analysis with file/line, and proposed fix.
>
> Severity scale: **P0** blocks core flow · **P1** major user-visible defect · **P2** minor UX issue.

## DEFECT-001 — Release API returns generic "Invalid release data" with no field-level errors

- **Severity:** P1
- **Found in:** `qa-onboarding/screenshots/IA-14-release-invalid.png`
- **Finding ref:** D-18, D-19
- **Code location:** `src/app/api/releases/route.ts:6-13, 35-81`
- **Reproduction:**
  1. Go to `/releases/new`.
  2. Fill in `Release name` with a valid value. Optionally fill `Version`, `CI branch`, `Jira fix version`, `Metrics service scope`. Pick a `Target environment`.
  3. Click `Register release event` with a CI branch that is not in the toolchain mapping (e.g., `release/qa-drive`).
  4. Server returns 400 with body `{ "error": "Invalid release data" }`. The form shows a single red paragraph.
- **Expected:** Either the field that failed validation is highlighted inline, or the message tells the user which field violated the rule. The actual validator behind this is the Zod schema + Prisma foreign key on `branch → toolchain_mapping` (per source code reading).
- **Actual:** Single red text under the form, no field hint, no list of errors. User has to guess whether it's the name, version, branch, or scope.
- **Root cause:** `route.ts:79` — bare `catch` block swallows the ZodError and returns a constant string. The Zod schema on lines 6-13 has no custom messages and the parser result is dropped.
- **Proposed fix:**
  ```ts
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: err.flatten().fieldErrors },
        { status: 400 },
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // toolchain mapping FK violation, etc.
      return NextResponse.json(
        { error: "Foreign key violation", code: err.code, meta: err.meta },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid release data" }, { status: 400 });
  }
  ```
  Then on the client (`releases/new/page.tsx`), map `fieldErrors` to inline per-field error text.

---

## DEFECT-002 — Release page banner shows raw CUID instead of release name

- **Severity:** P2 (cosmetic but very visible; recurs on every deep-link to a release/incident/thread)
- **Found in:** `qa-onboarding/screenshots/IA-15-release-created.png`, `IA-16-release-assessed.png`
- **Finding ref:** D-20
- **Code location:** `src/lib/workspace-mode.ts:365-393` (`resolvePageTitleForPath`)
- **Reproduction:**
  1. Create a new release, get redirected to `/releases/<cuid>`.
  2. Page banner reads `Cmsoco95300hi01ry8onw8yj6` (the raw CUID, capitalized first letter).
  3. The H1 below correctly reads `QA-Drive Test Release`.
- **Expected:** Banner reads the release name (e.g., "QA-Drive Test Release · DEVELOPMENT").
- **Actual:** Banner reads the raw CUID, which is not human-readable and doesn't match the H1.
- **Root cause:** `workspace-mode.ts:379` — the CUID-detection regex `/^[a-f0-9-]{8,}$/i` only matches hex-char CUIDs. Connexus uses cuid v1 which starts with `c` followed by `m`, `s`, `n`, `r`, `w`, `y`, `j` — chars outside `[a-f]`. The regex fails, the code falls through to `last.split('-').map(capitalize)` (line 389-392), which capitalizes the first letter of the CUID and returns it.
- **Proposed fix:** Make the regex match the actual cuid alphabet:
  ```ts
  // cuid v1: starts with 'c', then [a-z0-9]+, length >= 20
  if (/^c[a-z0-9]{18,}$/i.test(last) || /^\d+$/.test(last)) {
    const parent = segments[segments.length - 2];
    if (parent) return parent; // already correct for known sections like "releases"
  }
  ```
  Or, more robust: each detail page should pass its loaded record's display name to the AppShell, overriding the title. e.g., `<AppShell title={release.name}>` instead of letting `resolvePageTitleForPath` guess from the URL.

---

## DEFECT-003 — Jira sync error response shown to user as raw JSON

- **Severity:** P1 (security UX — internal error envelope leaked to end user)
- **Found in:** `qa-onboarding/screenshots/IA-07-jira-sync-error.png`
- **Finding ref:** D-10
- **Code location:** `src/lib/jira-api/errors.ts:19-27` (`parseJiraErrorBody`)
- **Reproduction:**
  1. With a Jira site whose primary board does not support sprints.
  2. Click `Sync Jira data` on `/integrations`.
  3. UI shows: `Jira API error (400): {"errorMessages":["The board does not support sprints"],"errors":{}}`
- **Expected:** User-facing message like: *"Sync failed — the connected Jira board is not a sprint board. Try selecting a different board or contact your Jira admin."* Or, at minimum, a clean `"The board does not support sprints"`.
- **Actual:** Raw Jira JSON error envelope shown verbatim. Leaks the `errorMessages` and `errors` schema to the end user (small information disclosure + ugly UX).
- **Root cause:** `errors.ts:19-27`:
  ```ts
  function parseJiraErrorBody(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch { /* not JSON */ }
    return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  }
  ```
  Jira's error envelope has `errorMessages: string[]` and `errors: Record<string, string>`, NOT a top-level `message` field. So `parsed.message` is `undefined`, the function falls through and returns the raw JSON string.
- **Proposed fix:**
  ```ts
  function parseJiraErrorBody(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as {
        message?: string;
        errorMessages?: string[];
        errors?: Record<string, string>;
      };
      if (parsed.message) return parsed.message;
      const parts: string[] = [];
      if (parsed.errorMessages?.length) parts.push(parsed.errorMessages.join("; "));
      if (parsed.errors && Object.keys(parsed.errors).length) {
        parts.push(Object.entries(parsed.errors).map(([k, v]) => `${k}: ${v}`).join("; "));
      }
      if (parts.length) return parts.join(" — ");
    } catch { /* not JSON */ }
    return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  }
  ```
  Then in `formatJiraSyncError` (line 29-47) add a specific check for `parsed.errorMessages` containing "sprint" → "Sync failed — the connected Jira board is not a sprint board."

---

## DEFECT-004 — "Jenkins · 3 disconnected" banner against "Coming soon" card

- **Severity:** P2
- **Found in:** `qa-onboarding/screenshots/IA-08-connect-grid.png`, `IA-12-jenkins-coming-soon.png`
- **Finding ref:** D-13
- **Reproduction:**
  1. Open `/integrations`.
  2. Banner says *"First issue: Jenkins · 3 disconnected"*.
  3. Click `Show` under `More connectors (1)` to expand the section.
  4. Jenkins card shows *"Coming soon — not available in this environment."* — single card, no Configure button.
- **Expected:** Either the banner count matches the actual card count (1 not 3), or there are 3 hidden Jenkins cards that should be shown (and a Configure form to add more servers).
- **Actual:** Banner count is hard-coded or stale; the actual Jenkins card is disabled.
- **Likely code:** Banner appears to be derived from a server health endpoint that hasn't been updated for the new "Coming soon" state. Probably `src/lib/integration-health.ts` (used by `src/components/integrations/integration-alerts.tsx`).
- **Proposed fix:** Cap the "Needs attention" banner to connectors that have `Configure` actions and aren't marked `comingSoon: true` in their feature flag config.

---

## DEFECT-005 — Failed integration syncs not recorded in audit log

- **Severity:** P1 (audit/compliance gap)
- **Found in:** `qa-onboarding/screenshots/IA-29-audit-all-filters.png`
- **Finding ref:** D-12, D-32
- **Reproduction:**
  1. Click `Sync Jira data` on `/integrations`.
  2. Sync fails (D-10 error).
  3. Open `/audit`. There is no entry for the failed sync.
- **Expected:** Audit log has an entry like `integration · jira · sync failed` with the error.
- **Actual:** Only successful state changes are audited. Failed syncs leave no trail. Combined with D-12 (no timestamp refresh), the user has no record of attempting a sync.
- **Likely code:** `src/app/api/integrations/jira/sync/route.ts` (or similar) — error path returns a 400/500 but doesn't write to `prisma.auditLog`. Compare with `src/app/api/releases/route.ts:64-73` which DOES write on success.
- **Proposed fix:** In the Jira sync handler, on error, write:
  ```ts
  await prisma.auditLog.create({
    data: {
      organizationId: session.organizationId,
      userId: session.userId,
      action: "integration.jira.sync_failed",
      entityType: "Integration",
      entityId: integration.id,
      metadataJson: JSON.stringify({ error: String(err) }),
    },
  });
  ```

---

## DEFECT-006 — Discovery wizard Industry dropdown does not persist into Review summary

- **Severity:** P1 (functionality broken — user input is silently dropped)
- **Found in:** `qa-onboarding/screenshots/IA-03-discovery-review.png`
- **Finding ref:** D-04
- **Reproduction:**
  1. Open `/governance/setup`.
  2. On step 1 (Organization), change `Industry` from `Technology` to `Finance`. Change `Team size` to `51-200`.
  3. Click `Continue`.
  4. On step 2 (Governance), set `Compliance` to `SOC 2` and `Deployment strategy` to `Manual approval gates`. Click `Continue`.
  5. On the Review step, the summary line reads: *"Connexus operates in **technology** …"*.
  6. Step 1 chip still shows the new team size "51-200" but Industry is back to "Technology".
- **Expected:** Industry = "Finance" persists to the Review summary and through DNA regeneration.
- **Actual:** Industry is reset. Compliance (SOC 2) and Deployment (Manual gates) DO persist.
- **Likely code:** `src/app/(platform)/governance/setup/page.tsx` — the step-1 Industry field either doesn't write to the form state, or the step-3 Review summary reads a different source. Could also be a Prisma field that doesn't exist in the discovery context table.
- **Proposed fix:** Compare the form-state writer for Industry vs the others; both should use the same `updateDna` mutation. Verify Industry is a key in the schema, not just a UI placeholder.

---

## DEFECT-007 — Approval Center card titled "Hold ..." with "Approve" button — cognitive mismatch

- **Severity:** P2 (UX)
- **Found in:** `qa-onboarding/screenshots/IA-23-approved.png`
- **Finding ref:** D-28
- **Reproduction:**
  1. Open `/approvals` with a release in PENDING_APPROVAL state.
  2. Card title: "Hold QA-Drive Test Release — resolve blockers before release".
  3. Three buttons: `Approve` / `Reject` / `Request modification`.
  4. Clicking `Approve` actually overrides the agent's hold and proceeds with the release.
- **Expected:** Button label clarifies the action — e.g., `Override and proceed` or `Approve gate waiver` — or the card title says `Recommendation: hold release · Approve to proceed anyway`.
- **Actual:** The action of "Approve" is intuitive for a "Release" but counter-intuitive for a "Hold" recommendation.
- **Likely code:** `src/app/(platform)/approvals/page.tsx` (or `src/components/approvals/*`) — button label is hard-coded.
- **Proposed fix:** Make the button label a function of the recommendation type:
  ```ts
  const approveLabel = recommendation.kind === "HOLD" ? "Override and proceed" : "Approve";
  ```

---

## DEFECT-008 — Audit log category counts are stale (don't auto-refresh on new events)

- **Severity:** P2
- **Found in:** `qa-onboarding/screenshots/IA-29-audit-all-filters.png`
- **Finding ref:** D-33
- **Reproduction:**
  1. Open `/audit`. "All events (50)" + category counts visible.
  2. Navigate away and trigger a new event (e.g., approve a recommendation, update an incident).
  3. Navigate back to `/audit`. Counts still show "50" even though the new event is in the list.
- **Expected:** Counts reflect the total after recent activity. Or at minimum, a "Refresh" button.
- **Actual:** The counts render once on page load and don't re-evaluate.
- **Likely code:** `src/app/(platform)/audit/page.tsx` — the `prisma.auditLog.count` (or equivalent) is computed server-side at request time but the client cache shows the SSR value.
- **Proposed fix:** Either invalidate the React Query cache for `/audit` on any state change, or recompute counts on focus/visibility change.

---

## DEFECT-009 — Recommendation cards have no in-app acknowledgment

- **Severity:** P2
- **Found in:** `qa-onboarding/screenshots/IA-24-recs-why.png`
- **Finding ref:** D-27
- **Reproduction:**
  1. Open `/recommendations`.
  2. Six cards visible. Each has only `Why this matters` toggle.
  3. No Approve / Defer / Dismiss / Acknowledge button.
  4. After acting on the underlying issue (triage CX-1153, fix the security group), there is no way to mark the recommendation as "done" inside AIDOS.
- **Expected:** Per-card actions: `Acknowledge` (mark seen), `Defer` (with reason), `Dismiss` (with reason), or `Promote to approval` for governance items.
- **Actual:** Card is read-only. The OPS guidance says "work these without a leadership gate" but offers no audit-trail button.
- **Likely code:** `src/components/recommendations/recommendation-card.tsx` (or similar).
- **Proposed fix:** Add a small "..." menu with `Acknowledge`, `Defer`, `Dismiss`. On action, write to `prisma.recommendationAction` (or similar) and write to `prisma.auditLog`.

---

## DEFECT-010 — Release form: "branch must be in toolchain mapping" with no UI hint

- **Severity:** P1
- **Found in:** `qa-onboarding/screenshots/IA-14-release-invalid.png`
- **Finding ref:** D-19
- **Reproduction:** Same as DEFECT-001 but specifically with `branch = release/qa-drive` (a name not in toolchain mapping).
- **Expected:** Inline error on the branch field: "Branch `release/qa-drive` is not in your toolchain mapping. Add it under Governance → Toolchain mapping or pick from the list."
- **Actual:** Generic "Invalid release data" with no hint.
- **Likely code:** `src/app/api/releases/route.ts:35-52` — Prisma create fails with a foreign-key violation on `branch → toolchain_mapping` (or similar). The catch block (line 79) hides this.
- **Proposed fix:** See DEFECT-001's proposed fix. Add specific handling for `Prisma.PrismaClientKnownRequestError` with code `P2003` (FK violation).

---

## DEFECT-011 — Industry dropdown is silently ignored vs Compliance/Deployment which persist

- **Severity:** P1 (subset of DEFECT-006, separated for clarity)
- **Found in:** Same as DEFECT-006.
- **Finding ref:** D-04
- **Likely code:** `src/app/(platform)/governance/setup/page.tsx` — Industry and Team size are step-1 fields; Compliance and Deployment are step-2 fields. The mutation that persists step-1 fields may not include `industry` in its payload.
- **Proposed fix:** Verify both fields are written to the same `dna.update` mutation. Cross-reference with the Review summary's data source.

---

## Summary table

| # | Severity | Title | File |
|---|---|---|---|
| 001 | P1 | Release API swallows ZodError | `src/app/api/releases/route.ts:79` |
| 002 | P2 | CUID banner | `src/lib/workspace-mode.ts:379` |
| 003 | P1 | Jira raw JSON to user | `src/lib/jira-api/errors.ts:19-27` |
| 004 | P2 | "3 disconnected" vs "Coming soon" | `src/lib/integration-health.ts` (likely) |
| 005 | P1 | Failed sync not audited | `src/app/api/integrations/jira/sync/*` (likely) |
| 006 | P1 | Discovery Industry not persisted | `src/app/(platform)/governance/setup/page.tsx` |
| 007 | P2 | "Approve" overrides "Hold" — confusing | `src/app/(platform)/approvals/page.tsx` |
| 008 | P2 | Audit counters stale | `src/app/(platform)/audit/page.tsx` |
| 009 | P2 | No rec card actions | `src/components/recommendations/*` |
| 010 | P1 | Branch FK violation no hint | `src/app/api/releases/route.ts:35-52` |
| 011 | P1 | (subset of 006) | same |

# Overview dashboard — navigation & user-journey audit

**Date:** 2026-09-07  
**Surface:** `/dashboard` (Connexus Overview fixture, default on)  
**Method:** Intensive browser walkthrough on `npm run dev` (`localhost:3000`), desktop + narrow viewports  
**Account:** `connexus@neoito.com`  
**Scope:** All Overview chrome and cards **except** Delivery trend, Sprint burndown, and Activity heatmap chart interactions (explicitly deferred)

---

## Verdict

The Overview looks interactive (chevrons, › arrows, metric rows, pillar tiles, sprint chip) but many controls are **visual affordances without handlers**. Where links exist, several journeys **land on the wrong depth**, **drop team context**, or **contradict the Overview claim** (empty Approvals despite “1 decision needed”). Fixture team/sprint filters update the URL but **do not change the numbers**, so filtering feels broken.

---

## Severity legend

| Severity | Meaning |
|----------|---------|
| **P0** | Looks clickable / promises a journey; click does nothing or lands on empty contradiction |
| **P1** | Navigates, but destination mismatches claim, loses context, or is a stub |
| **P2** | Works partially; polish / consistency issues |

---

## Inventory: what was tested

| Region | Control | Expected journey | Observed |
|--------|---------|------------------|----------|
| Header | Sprint chip `Sprint 37 \| Aug 10 – Aug 24` + chevron | Open sprint picker / change sprint | **Dead** — focus only, no menu |
| Header | Share | Copy link + “Copied” feedback | Clipboard fails silently; label stays “Share” |
| Top bar | Date range `Aug 10–Aug 24` | Sprint window picker | Opens; only **one** sprint; sets `?sprint=37` |
| Top bar | User menu (MU) | Settings / Sign out | Works |
| Sidebar | Search / ⌘K | Command palette | Works |
| Sidebar | All teams / project list | Filter Overview by team | URL + sidebar highlight update; **numbers unchanged** (fixture) |
| Sidebar | Integrations / Settings | Destinations | HTTP 200 (not deep-audited) |
| Top nav | Overview / Delivery / Code / QA / Compliance | Section pages | Work |
| Top nav | Risk | Risk surface | **Stub** — “coming soon” |
| Top nav | Reports | Reports surface | **Stub** — “coming soon” |
| Delivery confidence | ⓘ info tip | Evidence tooltip | Tooltip not reliably shown on click |
| Delivery confidence | Team combobox | Filter by team | Works for URL; **same fixture metrics** for WEB/MOB |
| Delivery confidence | Gauge / score / caption | Drill into score | **Dead** |
| Delivery confidence | Metric rows (completion, blocked, spillover, AI risk) | Drill into evidence | **Dead** (static `<li>`) |
| Key takeaways | 31 items blocked › | Blocked evidence | → `/delivery-analysis` (works; no deep filter / team lost) |
| Key takeaways | 16 items at risk › | Spillover / at-risk list | → `/qa` (mismatch vs spillover story) |
| Key takeaways | AI code risk 6% › | Code risk detail | → `/code-analysis` (page shows **0%** AI risk) |
| Key takeaways | 4 compliance findings › | Compliance findings | → `/governance` (4 open findings — OK) |
| Score breakdown | View details | Pillar detail | → `/delivery-analysis` only (all pillars) |
| Score breakdown | Delivery / Code / QA / Compliance tiles | Per-pillar drill | **Dead** (non-link `<div>`s) |
| Attention banner | Body / count | List of N attention items | Body not clickable |
| Attention banner | Review now → | Attention queue | → `/delivery-analysis` (generic; not “2 items”) |
| Leadership card | View details → | Pending decisions | → `/approvals` with **0 pending** |
| Mobile nav | Overview / Delivery / QA / Settings | Section nav | Links present (narrow viewport) |

Charts (out of scope for navigation fixes, noted for pattern only): “Last 6 weeks” / “Last 2 weeks” range buttons are the same dead-chevron pattern as the header sprint chip.

---

## P0 — Dead or contradictory journeys

### 1. Header sprint selector is a fake control

- **Control:** `Sprint 37 | Aug 10 – Aug 24` with chevron (`OverviewHeader`)
- **Click:** No menu, no URL change, no feedback
- **Code:** `<button>` with **no** `onClick` / menu wiring
- **User impact:** Primary sprint control on the page is inert; users must discover the separate top-bar date control

### 2. Delivery confidence metrics and gauge do not drill down

- **Controls:** Score 48 / Caution / caption; rows for Sprint completion, Items blocked, Items spilling over, AI code risk
- **Click:** Stay on `/dashboard`
- **User impact:** The densest “what’s wrong” signals invite click-through but terminate immediately
- **Contrast:** Key takeaways *do* link for overlapping claims (blocked / AI risk), so the same facts behave differently in adjacent cards

### 3. Score pillar tiles look like cards but are not links

- Delivery / Code / QA / Compliance tiles render as bordered cards with scores and deltas
- Only the header **View details** link navigates — and always to `/delivery-analysis`, never Code / QA / Compliance
- Clicking the QA tile (score 44) does nothing; user cannot go to QA from the pillar that shows QA pain

### 4. Leadership CTA contradicts destination

- Overview: **“1 decision needed”** + **View details →**
- Destination: `/approvals` → **“No leadership actions right now”** / **0** pending / empty history
- Fixture `leadership.count: 1` is not backed by Approvals data
- **Journey terminates:** User is told to act, then told there is nothing to do

### 5. Team filter appears to work but numbers never change (fixture)

- Sidebar and card combobox set `?team=WEB` / `?team=MOB` and sync with each other
- Gauge stays 48; blocked stays 31; takeaways unchanged
- `getOverviewFixture` only accepts `teamKey` for the select value — it does **not** vary metrics
- **User impact:** Filtering feels broken (“I clicked Mobile App and nothing happened” to the eye)

### 6. React hydration errors during Overview use (dev)

DevTools reported hydration mismatches while interacting with Overview (AttentionBanner, ConfidenceGauge, delivery-confidence-card). Soft navigations sometimes appeared delayed until a second interaction. Worth treating as a reliability risk for client routing.

---

## P1 — Navigates, but journey is wrong or incomplete

### 7. Key takeaway destinations are shallow / mismatched

| Takeaway | `href` | Landing reality |
|----------|--------|-----------------|
| 31 items blocked | `/delivery-analysis` | Delivery analysis loads with blocked=31 — **topic OK**, but no `?focus=blocked` / issue list deep-link; team query dropped |
| 16 items at risk | `/qa` | QA intelligence (bugs/blocked) — **not** a spillover / at-risk sprint list |
| AI code risk at 6% | `/code-analysis` | Code page headline risk **0%** — **contradicts Overview fixture** |
| 4 compliance findings | `/governance` | Open findings Warning (4) — **aligned** |

### 8. Attention “Review now” is not an attention list

- Banner: **“2 items need attention”** + message about blocked issues
- CTA → `/delivery-analysis` (same as blocked takeaway)
- No page lists exactly those 2 attention items with reasons / originating decisions (concept: nothing silently suppressed; attention should be inspectable)
- Banner body is not clickable — only the CTA

### 9. Context (team / sprint) is dropped on outbound links

Outbound Overview links are bare paths (`/delivery-analysis`, `/qa`, `/approvals`, …). After selecting Mobile App (`?team=MOB`), leaving Overview drops the filter. Top-bar sprint (`?sprint=37`) is likewise not carried.

### 10. Top nav stubs terminate the shell journey

- **Risk** → heading only: “Release risk signals will land here — coming soon.”
- **Reports** → “Exportable release and evidence reports will land here — coming soon.”
- Tabs sit next to fully live Delivery / Code / QA / Compliance — stubs feel like broken routes

### 11. Score breakdown “View details” is not pillar-aware

Single link to Delivery analysis regardless of which pillar the user was looking at. No path from Compliance 65 → `/governance` or Code 66 → `/code-analysis` via the tiles.

### 12. Top-bar sprint window is nearly empty

Menu opens (“Sprint window”) with a **single** Sprint 37 entry. Selecting it only stamps `?sprint=37`; fixture Overview ignores sprint for content. Parallel dead header sprint chip makes this worse (two sprint UIs, one partial, one dead).

---

## P2 — Works with caveats

### 13. Share

Handler copies `window.location.href` and flips label to “Copied” on success. In this browser session clipboard permission failed (`NotAllowedError`); UI stayed on “Share” with no error toast — silent failure.

### 14. Info tips (ⓘ)

Five tips exist (Delivery confidence, Score breakdown, + chart tips). They are hover tooltips (`InfoTip`). Click alone did not surface tooltip content in automation; keyboard/hover discoverability is weak for evidence sourcing promised in product rules.

### 15. Shell navigation that works

- Top nav: Overview, Delivery, Code, QA, Compliance
- Sidebar: Search/command palette, Integrations, Settings
- User menu: Settings, Sign out
- Key takeaways / Attention CTA / Leadership CTA / Score “View details” **do** route (subject to P1 issues above)
- Sidebar ↔ card team combobox stay in sync when URL updates

### 16. Destinations that are substantive (when reached)

- `/delivery-analysis` — rich Delivery analysis (stale sync warnings present)
- `/qa` — QA intelligence with evidence samples
- `/code-analysis` — Code analysis (numbers disagree with Overview fixture)
- `/governance` — Compliance + open findings

---

## Journey maps (abrupt ends highlighted)

```
Overview → Sprint chip ─────────────── ✗ dead end
Overview → Metric "31 blocked" ─────── ✗ dead end
Overview → Pillar "QA" tile ────────── ✗ dead end
Overview → Gauge / Caution ─────────── ✗ dead end

Overview → Takeaway "31 blocked" ───── → Delivery analysis (OK topic; no deep filter)
Overview → Takeaway "16 at risk" ───── → QA (topic mismatch)
Overview → Takeaway "AI risk 6%" ───── → Code analysis (shows 0%)
Overview → Takeaway "4 compliance" ─── → Governance (OK)

Overview → Attention "Review now" ──── → Delivery analysis (not 2-item queue)
Overview → Leadership "View details" ─ → Approvals empty  ← contradiction

Overview → Top nav Risk / Reports ──── → "coming soon" stubs

Overview → Team Mobile App ─────────── → URL updates, metrics unchanged  ← fake filter
```

---

## Recommended fix order (product + eng)

1. **Wire or demote fake controls** — Header sprint chip, metric rows, pillar tiles, gauge: either link to real evidence routes or remove chevron/card hover affordances so they don’t look clickable.
2. **Align Leadership fixture with Approvals** — If Overview says `1 decision needed`, Approvals must show that decision; else show `0` on Overview.
3. **Make takeaways deep-link** — Prefer filtered destinations (`/delivery-analysis?risk=blockers`, spillover focus, code risk window) and preserve `team` / `sprint` query params.
4. **Per-pillar navigation** — Delivery → `/delivery-analysis`, Code → `/code-analysis`, QA → `/qa`, Compliance → `/governance` (tiles and/or View details).
5. **Fixture team variance or honest empty states** — Either vary fixture by `teamKey` or show “Demo data is org-wide” when filtering so the control doesn’t feel broken.
6. **Attention as a real queue** — “N items need attention” should open a list of those N items with reasons, not only Delivery analysis.
7. **Risk / Reports** — Hide tabs until ready, or replace stubs with an explicit “not available yet” pattern that doesn’t compete with live tabs.
8. **Share failure UX** — Toast when clipboard is denied.
9. **Fix Overview hydration mismatches** — Stabilize greeting / gauge / attention SSR vs client to avoid flaky soft navigation in dev.

---

## Out of scope (per request)

- Delivery trend chart interactions  
- Sprint burndown chart interactions  
- Activity heatmap cell / chart interactions  

(Range dropdown buttons on those cards share the same dead-chevron pattern as the header sprint chip; treat similarly when charts are in scope.)

---

## Environment notes

- App: `npm run dev` at `http://localhost:3000`
- Overview fixture default: on (`shouldUseOverviewFixture`); live data via `?fixture=0`
- Audit used default fixture Overview + live destinations for outbound links
- Viewport: desktop 1440×900 for sidebar; also exercised narrow layout (bottom mobile nav)

# Executive UX Page Audit

**Status:** Findings & recommendations  
**Date:** 2026-06-22  
**Scope:** All implemented routes compared against the redesigned `/dashboard` executive briefing  
**Method:** Parallel code audit of page components, briefing patterns, and data presentation layers

**Related:**

- [`docs/executive-dashboard-ux-plan.md`](./executive-dashboard-ux-plan.md) — Dashboard redesign spec (now largely implemented)
- [`docs/AIDOS-USP.md`](./AIDOS-USP.md) — Governance-aware operational intelligence positioning
- [`docs/DESIGN.md`](./DESIGN.md) — Steep editorial visual system

---

## 1. Executive summary

The redesigned `/dashboard` delivers a **briefing-first, time-respecting** experience for higher management: narrative headline, verdict claim cards, delivery confidence gauge, leadership decision queue, and explicit delegation of operational depth to team leads. The rest of the platform remains largely **MVP-era operator UI** — functional data, flat lists, and `PageHeader` + `Card` stacks without the narrative, verdict, and motion layers executives now expect from the home screen.

**The gap is not data — it is presentation.** Prisma and `org-data.ts` already expose confidence, impact, rationale, risk scores, release context, approval counts, and freshness signals. Most pages simply do not surface them in leadership-readable form.

### Score distribution (executive readiness)

| Score | Meaning | Routes |
|------:|---------|--------|
| **5** | Executive-grade briefing | `/dashboard` |
| **4** | Strong leadership surface; polish gaps only | `/releases/[id]`, `/qa`, `/observability`, `/delivery-analysis`, `/code-analysis`, `/login`, `/signup` |
| **3** | Useful but procedural; needs verdict layer | `/workflow`, `/governance`, `/releases`, `/devops`, `/incidents/[id]` |
| **2** | Operator/admin screens; major exec gap | `/recommendations`, `/approvals`, `/governance/setup`, `/governance/workflow`, `/governance/toolchain-mapping`, `/audit`, `/incidents`, `/reports`, `/settings`, `/admin` |
| **1** | Redirect-only or pure ops tooling | `/discovery`, `/delivery-dna`, `/integrations`, `/agents` (+ runs) |
| **N/A** | Correctly transactional or separate product mode | Auth, connect flows, accelerator, agent threads |

### Top 5 platform-wide priorities

1. **Fix `/approvals` recommendation cards** — approvers see title-only cards while the dashboard promises release-blocking context. Biggest trust gap in the governance loop.
2. **Rebuild `/reports`** — redundant metric wall without narrative; should reuse `composeExecutiveDeck` or become a printable briefing export.
3. **Redesign `/governance` as a Delivery DNA briefing** — hero summary, gauge, verdict strip, live rec/approval counts.
4. **Add executive summary strips** to `/recommendations` and `/approvals` — pending counts, urgency, release grouping.
5. **Apply verdict-first pattern** to `/incidents`, `/devops`, `/releases` list — operational leadership views still read as event logs.

---

## 2. Dashboard baseline (reference standard)

The redesigned dashboard (`src/app/(platform)/dashboard/page.tsx`) embodies these principles. Other leadership-facing pages should be evaluated against them.

### Design principles

| Principle | Implementation |
|-----------|----------------|
| **Briefing-first** | Hero answers "what happened / what matters" before charts or tables |
| **Time-respecting hierarchy** | Urgency order: approvals → rollbacks → incidents → release status → delivery confidence |
| **Scannability** | Large display numbers, verdict badges, one supporting sentence per claim (no bullet dumps) |
| **Executive tone** | Plain English; banned jargon (telemetry, heartbeat, autonomy mode as raw labels) |
| **Progressive disclosure** | L1 hero → L2 "What needs attention" → L3 deck with delegation |
| **Governance-first gates** | No DNA → `GovernanceEmptyState`; missing integrations → dashed placeholders |
| **Data honesty** | Freshness strip, blind spots, no misleading scores on stale/missing data |
| **Delegate, don't monitor** | "Delegate the detail" section with audience-tagged team links |
| **Editorial visual language** | `font-display`, 24px card radius, rust/apricot punctuation, `steep-hero-glow` |
| **Motion with accessibility** | `src/components/motion/*`, `useReducedMotion` fallbacks |

### Key component patterns to reuse

| Pattern | Component path |
|---------|------------------|
| Hero + headline segments | `src/components/executive-briefing/executive-briefing-hero.tsx` |
| Verdict claim cards | `src/components/executive-briefing/briefing-claim-card.tsx` |
| KPI highlights rail | `src/components/executive-briefing/briefing-highlights.tsx` |
| Leadership decision queue | `src/components/executive-briefing/briefing-executive-deck.tsx` |
| Health gauge | `src/components/executive-briefing/delivery-health-gauge.tsx` |
| Governance empty state | `src/components/executive-briefing/governance-empty-state.tsx` |
| Data composition | `src/lib/executive-briefing/compose-briefing.ts`, `compose-executive-deck.ts` |
| Motion system | `src/components/motion/` |

### Evaluation checklist (per page)

- [ ] Leads with governance/operational intelligence, not "AI agents"
- [ ] Most urgent items surface first
- [ ] Verdict badges with plain-English labels (not raw enums)
- [ ] One-line section purpose under each major heading
- [ ] Key figures use `font-display` + tabular numbers (32–44px tier)
- [ ] Leadership actions distinguished from team-operational detail
- [ ] Data freshness visible when decisions depend on integrations
- [ ] Positive empty states when nothing needs attention
- [ ] Motion respects `prefers-reduced-motion`
- [ ] Anti-pattern: spreadsheet dashboard without narrative framing

---

## 3. MVP governance loop

The core product loop is **Discovery → Delivery DNA → Recommendations → Approvals**. The dashboard assumes DNA exists and tells the leadership story; the loop pages are where executives land when they act on dashboard CTAs.

### Route fragmentation

| URL | Actual destination | Issue |
|-----|-------------------|-------|
| `/discovery` | Redirect → `/governance/setup` | No UI; naming mismatch |
| `/delivery-dna` | Redirect → `/governance` | No UI; DNA buried under "Delivery governance" title |
| `/governance/setup` | Discovery wizard | Operator onboarding, not executive |
| `/governance` | Policy console | DNA summary is a late card, not the hero |

### `/discovery` and `/delivery-dna`

**Executive readiness: 1/5** — Redirect-only aliases.

**Suggestions:**

- P1: Build a dedicated Delivery DNA briefing at `/delivery-dna` (or consolidate aliases into `/governance` with clear naming).
- P2: Smart redirect — if DNA exists, send `/discovery` to dashboard or governance briefing, not setup wizard.
- P3: Add `?from=` query param and scroll/highlight target section on destination.

### `/governance/setup` — Discovery wizard

**Files:** `src/app/(platform)/governance/setup/page.tsx`, `src/components/discovery/discovery-wizard.tsx`  
**Executive readiness: 2/5** — Appropriate for delivery managers completing onboarding, not executives.

**Gaps:**

- Title says "Governance setup"; onboarding calls it "Discovery & Delivery DNA"
- Re-run does not pre-fill from existing `OrganizationProfile` (hardcoded defaults)
- No preview of DNA output, governance score, or recommendations before submit
- No time estimate or executive framing per step
- No motion or editorial layout vs dashboard

**Suggestions:**

- P1: Pre-fill wizard on re-run from server-loaded profile data
- P1: Add review/preview step showing DNA summary, governance score, autonomy mode (reuse claim card / gauge patterns)
- P2: Rename to "Discovery & Delivery DNA" for nav/onboarding alignment
- P2: One-line governance copy per step ("Compliance selection sets approval depth for release recommendations")
- P3: Post-submit "DNA ready" screen with CTAs to `/dashboard` and `/recommendations`

### `/governance` — Delivery DNA & policy view

**Files:** `src/app/(platform)/governance/page.tsx`  
**Executive readiness: 2/5** — Readable for admins who know the system; not a one-minute executive briefing.

**Gaps:**

- Flat card stack; no story → verdict → detail flow
- Raw internal keys (`lean-mvp`, numeric approval level) without plain-English labels
- `observabilityStrategy`, maturity scores, tools/workflows from discovery not displayed
- Governance score as plain 44px text, not gauge with band label
- No live pending recommendations/approvals counts despite discovery seeding them
- No `updatedAt` or link to generated recommendations

**Suggestions:**

- P1: DNA-first hero using `ctx.dna.summary` (reuse `BriefingHeadline` pattern)
- P1: Governance score as `DeliveryHealthGauge` with band label (strong/steady/caution/at risk)
- P1: Verdict strip — "Recommend-only autonomy · Level 2" with tone styling
- P2: Discovery context panel (industry, team size, tools, maturity from `OrganizationProfile`)
- P2: Live widgets — pending recommendations → `/recommendations`, pending approvals → `/approvals`
- P3: Collapse escalation matrix behind "Approval paths"; apply `RevealSection` motion

### `/recommendations`

**Files:** `src/app/(platform)/recommendations/page.tsx`  
**Executive readiness: 2/5** — Engineer backlog, not leadership briefing.

**Gaps:**

- No summary layer (pending count, critical count, releases affected)
- Flat chronological stack; `CRITICAL` vs `LOW` only as small badges
- Raw enums (`PENDING`, `CRITICAL`) instead of verdict language
- Full rationale on every card — heavy for executives
- No grouping by release, impact, or approval state
- No motion, freshness, or cross-link to approvals

**Suggestions:**

- P0: Executive summary strip above list (pending, critical/high, releases affected, link to `/approvals`)
- P0: Default sort by impact × confidence; collapse rationale behind "Why this matters"
- P1: Extract `RecommendationCard` with verdict badge, release context, CTA
- P1: Group by release when `releaseId` is set
- P2: Cross-link when `rec.approvals` has pending items
- P2: Rich empty state aligned with `GovernanceEmptyState`

### `/approvals`

**Files:** `src/app/(platform)/approvals/page.tsx`, `src/components/approvals/approval-actions.tsx`, `agent-hire-approval-card.tsx`  
**Executive readiness: 2/5** — **Critical trust gap:** recommendation approvals show title only.

The dashboard composes copy like "2 approvals waiting before Release 1.2 can ship." The approval center does not show release name, impact, confidence, rationale, or risk score. Agent hire cards are materially richer — inconsistent trust model.

`ReleaseGateBrief` (`src/components/releases/release-gate-brief.tsx`) is more executive-ready than the Approval Center itself.

**Suggestions:**

- P0: `RecommendationApprovalCard` with full recommendation + release context (match `AgentHireApprovalCard` depth)
- P0: Hero summary — "2 approvals blocking Acme Release 2.4" with urgency ordering
- P0: Unify decision UX with `approval-inline-card.tsx` pattern
- P1: History rows with `decidedAt`, approver, comment, release, decision tone
- P1: Caught-up empty state mirroring dashboard `CheckCircle2` block
- P1: Error feedback on failed approve/reject POST
- P2: Split pending by type — "Release governance" vs "Agent hires"

### `/workflow`

**Files:** `src/app/(platform)/workflow/page.tsx`  
**Executive readiness: 3/5** — Good orientation hub; procedural not insight-rich.

**Suggestions:**

- P1: Badge counts on steps 9–10 (recommendations, approvals) from `ctx.stats`
- P2: Hero strip — "3 stages need attention" with links
- P3: "Executive view" link back to `/dashboard`

### `/audit`

**Files:** `src/app/(platform)/audit/page.tsx`  
**Executive readiness: 2/5** — Raw chronological log for compliance officers.

**Suggestions:**

- P1: Filter bar + summary counts by action type; preset "Approval decisions"
- P2: Link from Approvals history → filtered audit view
- P3: "Last governance decision" highlight card for executive skim

---

## 4. Release governance

### `/releases`

**Executive readiness: 3/5** — List without portfolio verdict.

**Gaps:** No aggregate "releases at risk" count; status badges without GO/HOLD/WAIT framing.

**Suggestions:**

- P1: Summary KPI row (pending, blocked, deployed)
- P2: Verdict badge from `release-gate-brief` logic; sort/filter by risk

### `/releases/[id]`

**Executive readiness: 4/5** — Closest to dashboard quality for a single release via `ReleaseGateBrief`.

**Gaps:** Pre-assess state is weak; approval actions live on `/approvals`, not inline; no motion.

**Suggestions:**

- P1: Pre-assess panel — "Not yet assessed — expected signals: …"
- P1: Inline approve/reject for release-linked items (reduce context switching)
- P2: Verdict headline above fold; `RevealSection` + `HoverLift` on gate brief
- P2: Compact exec mode for gate brief (verdict + 3 bullets)

### `/releases/new`

**Executive readiness: N/A (3/5 as form)** — Operator task.

**Suggestions:** P2 — Inline "What happens after register" steps; P3 — Pre-fill from latest release.

---

## 5. Intelligence & observability surfaces

These pages are explicitly linked from the dashboard "Delegate the detail" section. Several already align well; they need verdict strips and motion parity, not full rewrites.

### Pages that already align (extend patterns)

| Route | Score | Strengths | Remaining gaps |
|-------|------:|-----------|----------------|
| `/qa` | 4/5 | KPI row → pending decisions → `ReleaseGateBrief` per release | No org-level GO/HOLD verdict; no motion |
| `/observability` | 4/5 | Progressive empty states; executive-oriented PageHeader | No top-level stability verdict; no incidents cross-link |
| `/delivery-analysis` | 4/5 | Jira signals with strong description copy | No sprint verdict; weak release tie-in |
| `/code-analysis` | 4/5 | AI vs human attribution for leaders | Governance signals card below fold; mock/live unclear |

**Shared suggestions for these four:**

- P2: Top-level verdict strip ("Production stable" / "Delivery confidence: caution")
- P2: Freshness banner like `BriefingFreshnessStrip`
- P3: Motion on KPI strip via `AnimatedNumber` / `RevealSection`

### `/reports`

**Executive readiness: 2/5** — **Highest-priority gap outside governance loop.**

Metric wall without interpretation; duplicates dashboard stats without narrative. Nine+ stats with equal weight.

**Suggestions:**

- P1: Rebuild as printable executive summary using `composeExecutiveDeck` data
- P1: Lead with 3 claims max, not a spreadsheet
- P2: Trend deltas vs last period
- P3: Export PDF alongside CSV

### `/devops`

**Executive readiness: 3/5** — Event log without deployment health verdict.

**Suggestions:**

- P1: Lead with deployment health verdict + degraded count
- P2: Group events by release
- P2: Reuse deployment dimension from health score if available

### `/incidents` and `/incidents/[id]`

**Executive readiness: 2/5 (list), 3/5 (detail)** — No "what's on fire in 5 seconds" framing.

**Suggestions:**

- P1: Open incidents claim card at top of list; sort by severity/status
- P2: Executive summary box on detail ("Severity X · Release Y · Recommended action")
- P3: Activity timeline; collapse remediation for read-only roles

---

## 6. Organization, settings, and admin

### `/settings`

**Executive readiness: 2/5** — Admin page; executive treatment not required, but overlaps `/admin`.

**Suggestions:** P1 — Differentiate settings (self + team) vs admin (governance ops); P2 — Quick links card (integrations, audit).

### `/admin`

**Executive readiness: 2/5** — Operator console with governance score but no interpretation.

**Suggestions:** P1 — Merge or clearly split with `/settings`; P2 — Interpreted status line; P2 — Reuse `GovernanceEmptyState` for pre-DNA.

### `/integrations`

**Executive readiness: 1/5** — Correctly admin/integrator tooling; too technical for leadership glance.

**Suggestions:** P1 — Top summary strip (N/M integrations healthy); P2 — Hide dev config warnings behind admin role.

---

## 7. Auth, connect, and routing

### `/login` and `/signup`

**Executive readiness: 4/5 (N/A)** — Appropriately transactional. Split hero + form card matches Steep tokens.

**Suggestions:** P3 — Tighten hero copy to governance-AOI USP; P2 — Post-signup route to `/governance/setup` with orientation.

### `/` (root)

Session-aware redirect only. No public marketing surface for unauthenticated visitors.

**Suggestion:** P3 — Lightweight public landing if GTM needs it.

### Connect flows (`/connect/github/[token]`, `/connect/jira/[token]`, `/connect/done`, `/connect/error`)

**Executive readiness: N/A (4/5)** — External transactional flows; appropriately simple.

**Suggestions:** P3 — Logo component; plainer scope descriptions for Jira.

---

## 8. Agent platform (operator tooling)

These pages correctly skip executive treatment. They should not appear in leadership navigation but need polish to avoid breaking enterprise feel.

| Route | Score | Issue | Suggestion |
|-------|------:|-------|------------|
| `/agents` | 1/5 | Dev worker instructions in footer for all users | P1: Hide behind admin role; P2: Fleet status strip |
| `/agents/[id]` | N/A | Heavy instructions editor | P3: RBAC hide editor |
| `/agents/[id]/runs` | N/A | Debug/ops only | P4: Summary chips (success/fail 24h) |
| `/agent-threads` | N/A | Collaboration UI | P2: Thread summary card; P3: Wider lg+ layout |

---

## 9. MVP Accelerator (separate workspace mode)

**Routes:** `/accelerator`, `/accelerator/new`, `/accelerator/[id]`  
**Executive readiness: N/A** — ENTERPRISE workspace redirects to `/dashboard`. Intentionally separate product mode.

**Suggestions:** P3 — Executive summary artifact at top of package; P4 — TOC for long PRDs.

---

## 10. Cross-cutting systemic gaps

| Gap | Impact | Remediation |
|-----|--------|-------------|
| **Motion system only on dashboard** | Rest of app feels static | Apply `RevealSection`, `HoverLift`, `AnimatedNumber` to leadership pages incrementally |
| **`PageHeader` everywhere, no hero layer** | Same title size, wildly different content depth | Leadership pages get verdict headline above `PageHeader` or replace it |
| **Data duplicated across `/dashboard`, `/reports`, `/qa`** | Drift risk, cognitive load | Single source: `loadExecutiveBriefing` + domain-specific extensions |
| **`GovernanceEmptyState` not reused** | Inconsistent first-run UX on DNA-gated pages | Apply pattern on reports, intelligence pages when integrations missing |
| **Component reuse opportunity** | `executive-briefing/*` and `motion/*` are dashboard-only | Extract shared `ExecutiveSummaryStrip`, `VerdictBadge`, `LeadershipQueue` |
| **Navigation placement** | Governance loop buried in collapsed nav | Dashboard CTAs compensate, but execs may miss `/approvals` without briefing links |
| **Dev/ops copy on `/agents`** | Breaks executive polish | Role-gate technical instructions |
| **No `/profile` or marketing landing** | Enterprise positioning gap for prospects | Out of scope unless GTM requires |

### Recommended pattern for any leadership page

```
Verdict headline
  → 3 claim cards (max)
  → optional gauge / KPI rail
  → detail on scroll (with motion)
  → delegate links for team-operational depth
```

Feed from existing loaders in `src/lib/executive-briefing/` where possible; extend for domain-specific pages (QA, observability, code analysis).

---

## 11. Implementation roadmap

Phased sequence balancing trust gaps, reuse, and effort.

### Phase A — Close the governance loop trust gap (P0)

| Item | Route | Effort |
|------|-------|--------|
| Full-context recommendation approval cards | `/approvals` | Medium |
| Hero summary with release-blocking context | `/approvals` | Small |
| Executive summary strip | `/recommendations` | Small |
| Triage sort + collapsed rationale | `/recommendations` | Medium |

### Phase B — Leadership surfaces (P1)

| Item | Route | Effort |
|------|-------|--------|
| Delivery DNA briefing redesign | `/governance` | Large |
| Rebuild as executive summary | `/reports` | Large |
| Open incidents claim card + severity sort | `/incidents` | Medium |
| Deployment health verdict | `/devops` | Medium |
| Release portfolio KPI row + verdict badges | `/releases` | Medium |
| Pre-fill + review step | `/governance/setup` | Medium |

### Phase C — Extend existing strong pages (P2)

| Item | Routes |
|------|--------|
| Org-level verdict banner | `/qa` |
| Stability verdict strip + freshness | `/observability` |
| Delivery confidence one-liner | `/delivery-analysis` |
| Elevate governance signals to highlights | `/code-analysis` |
| Verdict headline + motion | `/releases/[id]` |
| Workflow step badge counts | `/workflow` |
| Audit filters + approval preset | `/audit` |

### Phase D — Polish & consolidation (P3–P4)

- Motion parity across leadership pages
- Route naming alignment (`/discovery`, `/delivery-dna`, nav, onboarding)
- Settings/admin split
- Integrations health summary strip
- Auth copy alignment with USP
- Agent platform role-gating

---

## 12. Full route scorecard

| Route | Exec readiness | Needs exec treatment? | Primary action |
|-------|---------------:|:----------------------:|----------------|
| `/dashboard` | 5 | Yes (done) | Maintain; extend data sources |
| `/releases/[id]` | 4 | Yes | Inline approvals; pre-assess copy |
| `/qa` | 4 | Yes | Org verdict banner |
| `/observability` | 4 | Yes | Stability verdict strip |
| `/delivery-analysis` | 4 | Yes | Sprint verdict + release links |
| `/code-analysis` | 4 | Yes | Elevate governance signals |
| `/login` | 4 | No | USP copy tweak |
| `/signup` | 4 | No | Post-signup orientation |
| `/workflow` | 3 | Partial | Blocker summary strip |
| `/governance` | 3 | Yes | Full DNA briefing redesign |
| `/releases` | 3 | Yes | Portfolio verdict |
| `/devops` | 3 | Partial | Deployment health verdict |
| `/incidents/[id]` | 3 | Partial | Executive summary box |
| `/recommendations` | 2 | Yes | Summary strip + triage |
| `/approvals` | 2 | Yes | **Full-context cards (P0)** |
| `/governance/setup` | 2 | No (onboarding) | Pre-fill + preview step |
| `/audit` | 2 | Partial | Filters + highlights |
| `/incidents` | 2 | Yes | Open incidents hero |
| `/reports` | 2 | Yes | Rebuild as briefing |
| `/settings` | 2 | No | Differentiate from admin |
| `/admin` | 2 | No | Interpreted status |
| `/discovery` | 1 | N/A | Consolidate or smart redirect |
| `/delivery-dna` | 1 | N/A | Dedicated briefing or alias cleanup |
| `/integrations` | 1 | No | Health summary strip |
| `/agents` (+ runs) | 1 | No | Role-gate dev copy |
| Connect flows | N/A | No | Branding polish |
| Accelerator | N/A | No | Separate product mode |
| Agent threads | N/A | No | Optional summary cards |

---

## 13. Conclusion

The dashboard redesign sets a clear bar: **narrative-first, verdict-driven, time-respecting, governance-aware, with operational depth explicitly delegated.** The MVP governance loop and several intelligence pages (`/qa`, `/observability`, `/delivery-analysis`, `/code-analysis`, `/releases/[id]`) contain the right data but uneven presentation.

The most damaging asymmetry is between what the dashboard promises ("N approvals blocking Release X") and what `/approvals` delivers (title-only cards). Fixing that single gap restores trust in the entire executive briefing. From there, reusing `executive-briefing/*` and `motion/*` components across leadership routes — starting with `/governance`, `/reports`, and `/incidents` — will bring the platform to a consistent executive standard without rebuilding data layers.

**Estimated routes requiring meaningful work:** 12 leadership-facing pages  
**Estimated routes correctly scoped as operator/transactional:** 15+  
**Biggest reuse win:** Extract shared briefing primitives from dashboard components rather than one-off redesigns per page

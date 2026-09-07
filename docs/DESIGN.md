# Connexus Overview — Style Reference
> Daylight SaaS engineering dashboard

**Theme:** light

Connexus Overview is a clean daylight productivity dashboard: white chrome on a soft canvas (`#FBFBFA`), **DM Sans** throughout at a **14px** body base, orange accent (`#F4773D`) for icons and attention, and a separate brown family (`#8A4224` / `#88472B`) for active nav and primary CTAs. Cards are 14px-radius white surfaces with `#E6E8EB` borders and a soft `0 2px 7px` shadow. Colour is reserved for status (coral / amber / green / blue / purple) and data viz (gauge segments, heatmap blues, trend greens). The result reads as a focused engineering instrument — calm, dense, and decision-oriented.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ink | `#101828` | `--color-ink` / `--text-primary` | Headings, primary text |
| Body | `#344054` | `--text-secondary` | Body copy, metric labels |
| Muted | `#667085` | `--text-muted` | Secondary labels, captions |
| Faint | `#8A94A6` | `--text-faint` | Placeholders, tick labels, inactive chrome |
| Pure White | `#ffffff` | `--color-pure-white` | Cards, inputs |
| Canvas | `#FBFBFA` | `--bg-base` | Page background |
| Border | `#E6E8EB` | `--border` | Card borders |
| Border soft | `#EDF0F2` | `--border-soft` | Row dividers, sidebar edge |
| Accent | `#F4773D` | `--accent` | Icons, progress fills, attention |
| Accent soft | `#FFF0E8` | `--accent-soft` | Soft orange fills |
| Accent ring | `#FFE0D1` | `--accent-ring` | Soft orange borders |
| Brown | `#8A4224` | `--brown` | Active nav text |
| Brown soft | `#FFF1EA` | `--brown-soft` | Active nav / tab fill |
| Brown underline | `#8B492A` | `--brown-underline` | Active top-tab underline |
| Brown button | `#88472B` | `--brown-button` | Solid primary CTA |
| Coral | `#EF7778` | `--coral` | Danger / blocked signals |
| Amber | `#F3BD29` | `--amber` | Caution signals |
| Green | `#35B982` | `--green` | Positive / AI risk fill |
| Blue | `#4D91EE` | `--blue` | Info / burndown actual |
| Purple | `#8874E8` | `--purple` | QA pillar |
| Success | `#35B982` | `--success` | Positive deltas, synced dot |
| Danger | `#EF7778` | `--error` | Negative deltas |
| Warning | `#F3BD29` | `--warning` | Caution chips |
| Info | `#4D91EE` | `--info` | Heatmap / links |

## Tokens — Typography

### DM Sans — Body, UI, and display · `--font-dm-sans`
- **Weights:** 400, 500, 600, 700
- **Base:** 14px body (no tracking)
- **Sizes:** 9–11px captions, 12–14px UI, 18px sidebar brand, 28px page greeting
- **Role:** Single family for the product. `.font-display` is DM Sans 600 with tight tracking (no serif).

### Type Scale

| Role | Size | Weight | Use |
|------|------|--------|-----|
| caption | 9–11px | 400–500 | Chart ticks, footnotes |
| ui | 12–14px | 400–500 | Nav, metric labels, buttons |
| brand | 18px | 700 | Sidebar org name |
| greeting | 28px | 700 | Overview page header (−0.75px tracking) |
| metric | 16–24px | 600 | Signal values, pillar scores |
| gauge | 45px | 600 | Confidence score |

## Tokens — Spacing & Shapes

**Base unit:** 4px

### Border Radius

| Element | Value |
|---------|-------|
| cards | 14px (`--radius-card`) |
| tiles / buttons / chips | 8–9px |
| avatars / status dots | 9999px |
| inputs | 9–10px |

### Shadows

| Name | Value |
|------|-------|
| card | `0 2px 7px rgba(16, 24, 40, 0.025)` |

### Layout

- **Sidebar width:** 206px
- **Top bar height:** 54px
- **Card padding:** 15–22px
- **Row gaps:** 12–13px
- **Page content:** `min(1280px, 100% - 48px)`, padding `25px 0 28px`

## Components

### Sidebar
206px column, soft white `rgba(255,255,255,.72)`, `--border-soft` right edge. Orange ring org mark + 18px/700 org name. Search with magnifier + ⌘K. `WORKSPACE` eyebrow + project rows (active = brown text on `#FFF1EA` + 3px orange left rail). Bottom: two-line Data synced card, Integrations, Settings.

### Top bar
54px translucent white bar. Section tabs with full-width 3px brown underline on active. Right: explicit date-range button + 38px avatar.

### Overview cards
White, 14px radius, `#E6E8EB` border, soft shadow. Title row with optional ⓘ tip. Signal rows use a 4-column grid (icon | value+label | 8px bar | annotation).

### Gauge
180° SVG arc (implementation unchanged): coral / amber / mint segments, yellow marker with white ring, centre score + band pill.

### Attention banner
`#FFF0E8` background, brown solid CTA (`#88472B`).

### Leadership card
`#F2F7FF` tinted card, horizontal layout with outline details button.

## Visual reference

Pixel target: designer static build (`~/Downloads/new-design`) and [`docs/design/overview-mockup.jpg`](design/overview-mockup.jpg).

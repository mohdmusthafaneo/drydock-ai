# Connexus Overview — Style Reference
> Daylight SaaS engineering dashboard

**Theme:** light

Connexus Overview is a clean daylight productivity dashboard: white chrome on a soft grey canvas (`#F9F9F9`), Inter throughout, and a single orange accent (`#E8590C`) for active navigation, CTAs, and attention. Cards are 12px-radius white surfaces with hairline `#ECECEC` borders and a whisper of shadow. Colour is reserved for status (green / red / amber / blue) and data viz (gauge segments, heatmap blues, trend gradients). The result reads as a focused engineering instrument — calm, dense, and decision-oriented.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ink | `#111827` | `--color-ink` / `--text-primary` | Headings, primary text, filled dark CTAs |
| Body | `#374151` | `--text-secondary` | Body copy, metric labels |
| Muted | `#6B7280` | `--text-muted` | Secondary labels, captions |
| Faint | `#9CA3AF` | `--text-faint` | Placeholders, tick labels, inactive chrome |
| Pure White | `#ffffff` | `--color-pure-white` | Sidebar, cards, inputs |
| Canvas | `#F9F9F9` | `--bg-base` | Page background |
| Border | `#ECECEC` | `--border` | Card borders, progress tracks |
| Accent | `#E8590C` | `--accent` | Active tab underline, icons, primary orange CTA |
| Accent hover | `#C2410C` | `--accent-hover` | Strong orange (Review now) |
| Accent soft | `#FDEEE3` | `--accent-soft` | Caution pill, attention banner, active sidebar row |
| Accent ring | `#FBD5BF` | `--accent-ring` | Soft orange borders |
| Success | `#22A06B` | `--success` | Positive deltas, synced dot |
| Success soft | `#DFF5E9` | `--success-soft` | Positive chip backgrounds |
| Danger | `#EF6461` | `--error` | Negative deltas, risk |
| Danger soft | `#FDE8E7` | `--error-soft` | Negative chip backgrounds |
| Warning | `#F5B800` | `--warning` | Gauge marker, caution |
| Warning soft | `#FFF6D6` | `--warning-soft` | Soft amber fills |
| Info | `#2F80ED` | `--info` | Heatmap mid, links |
| Info soft | `#E8F1FD` | `--info-soft` | Heatmap lightest step |
| Gauge coral | `#F3A98C` | `--gauge-coral` | Gauge low band |
| Gauge amber | `#FBD25A` | `--gauge-amber` | Gauge mid band |
| Gauge mint | `#7FDCC0` | `--gauge-mint` | Gauge high band |

## Tokens — Typography

### Inter — Body, UI, and display · `--font-inter`
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px captions, 13–14px UI, 15px sidebar brand, 26px page greeting
- **Letter spacing:** −0.011em body; −0.02em display
- **Role:** Single family for the product. `.font-display` is Inter 600 with tight tracking (no serif).

### Type Scale

| Role | Size | Weight | Use |
|------|------|--------|-----|
| caption | 12px | 400–500 | Footnotes, heatmap labels |
| ui | 13–14px | 400–500 | Nav, metric labels, buttons |
| brand | 15px | 600 | Sidebar org name |
| greeting | 26px | 600 | Overview page header |
| metric | 28–36px | 600 | Pillar scores, gauge number |

## Tokens — Spacing & Shapes

**Base unit:** 4px

### Border Radius

| Element | Value |
|---------|-------|
| cards | 12px |
| tiles / buttons / chips | 8px |
| avatars / status dots | 9999px |
| inputs | 8px |

### Shadows

| Name | Value |
|------|-------|
| subtle | `0 1px 2px rgba(16, 24, 40, 0.04)` |

### Layout

- **Sidebar width:** ≈240px
- **Top bar height:** 56px
- **Card padding:** 16–20px
- **Page max content:** fluid within main column

## Components

### Sidebar
White column, 1px right border. Orange ring org mark + org name. Search with ⌘K. `WORKSPACE` eyebrow + project rows (active = accent-soft bg + orange icon). Bottom: Data synced card, Integrations, Settings.

### Top bar
56px white bar. Section tabs with 2px orange underline on active. Right: date-range button + user avatar menu.

### Overview cards
White, 12px radius, `#ECECEC` border, subtle shadow. Title row with optional ⓘ tip. Metric rows use icon tiles, progress bars on `#ECECEC` tracks.

### Gauge
180° SVG arc: coral / amber / mint segments, yellow marker with white ring, centre score + band pill.

### Attention banner
Accent-soft background, dark-orange CTA.

### Leadership card
People icon tile, count of pending decisions, outline link to Approvals.

## Visual reference

Pixel target: [`docs/design/overview-mockup.jpg`](design/overview-mockup.jpg).

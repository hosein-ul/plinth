---
project: Plinth
mode: studio
direction: Daylight
chosen: 2026-10-10 by the owner, option A of three proposals (.design/directions/index.html)
---

# Direction — Daylight

## Concept
The product settles in front of you. The interface is calm, light and exact; the only moving,
coloured thing is a payment becoming final and landing in the merchant's vault. Minimal, fintech,
soft UI.

## Position
Cool light · tinted off-white ground with white raised surfaces · balanced density (marketing
airy, app compact) · General Sans medium, tight · 11 / 16 / 22 px radii, hairline borders, long soft
shadows · monochrome ink + one mint-green signal · image system: the real product UI, staged ·
motion precise and quick · left statement with a product stage bleeding right.
Family: light airy product × product-led, with Swiss rigour.

## Colour (roles; contrast against ground #F3F5F8 unless noted)
| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| ground | #F3F5F8 | — | page |
| raised | #FFFFFF | — | cards, panels, inputs |
| sunk | #E9EDF2 | — | wells, segmented tracks, table headers |
| line / line-strong | rgb(15 23 42 / .08) / (.16) | — | borders, dividers |
| text | #0C1220 | 16.9:1 | primary text, primary buttons |
| text-2 | #485366 | 7.2:1 | secondary text |
| text-3 | #6B7688 | 4.6:1 | tertiary text, labels |
| text-4 | #8D97A8 | 2.9:1 | placeholders, disabled only |
| signal | #0EA66B | 3.1:1 (non-text) | confirmed states, live dot, progress, focus ring |
| signal-ink | #0A6F48 | 5.9:1 on #DFF5EA | text on signal-quiet |
| signal-quiet | #DFF5EA | — | settled fills |
| warn / warn-quiet / warn-ink | #C98A04 / #FDF3D7 / #7A5200 | 6.4:1 ink on quiet | pending, attention |
| bad / bad-quiet / bad-ink | #D5392F / #FCE7E4 / #9E1F17 | 6.6:1 ink on quiet | failed, destructive |
| info / info-quiet / info-ink | #2F6BFF / #E4ECFF / #1E49B8 | 6.9:1 ink on quiet | in flight, links in prose |

Strategy: ink does the work; mint appears only where the chain has confirmed something (and on
focus). No gradients on text. No second accent.

## Type
General Sans (Fontshare, variable, self-hosted via @fontsource-style CSS or the Fontshare CSS API)
for everything; JetBrains Mono for addresses, hashes, code and keyboard hints only.

| Level | Size | Line-height | Tracking | Weight |
| --- | --- | --- | --- | --- |
| display | clamp(44px, 5.6vw, 84px) | 1.0 | −0.045em | 500 |
| h1 | clamp(32px, 3.4vw, 48px) | 1.05 | −0.04em | 500 |
| h2 | 28px | 1.1 | −0.03em | 500 |
| h3 | 18px | 1.3 | −0.015em | 600 |
| body-lg | 17px | 1.5 | −0.005em | 400 |
| body | 14.5px | 1.5 | −0.005em | 400 |
| small | 13px | 1.45 | 0 | 400 |
| label | 12px | 1.3 | 0 | 500 |
| numeric | inherits | — | −0.02em | 500, tabular, decimals in text-3 |

Two-tone headlines (ink clause, then a text-3 clause) replace eyebrow + title + subtitle stacks.

## Space and grid
Scale 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96, 128, 160. Marketing container 1200 px, margins
24–40; sections 112–160 px apart. App content max 1280, 24–32 px gutters, cards padded 20–24.

## Shape
Radius: controls 11, surfaces 16, large panels 22, pills full. Borders 1 px at line. Elevation:
`soft` (0 1px 1px /.04, 0 2px 4px /.03, 0 18px 40px -18px /.22) for cards on ground; `float` for
overlays; none inside cards. Texture: a dot grid at low contrast, masked radially, behind heroes.

## Signature device
The settling sequence: five small check marks that fill mint in order (detected, verified, final,
swept, in vault), then the amount appears in the vault. It appears in the landing hero, the
checkout, the payment detail timeline and as a five-segment bar in tables. It never appears as
decoration and never advances from a click, only from backend state.

## Visual asset system
Product-as-image. Hero: staged checkout card + vault card joined by one dashed connector with a
travelling dot. Sections: real components at different scales (two-number balance tile, webhook
log, API snippet, network list, vault policy switcher). Backgrounds: ground + white radial light +
mint radial tint + masked dot grid. Brand mark: an ink rounded square with a small white plinth
block. Favicon and social image from the mark. Empty states: a quiet version of the dot grid with
one sentence and one action.

## Motion
Precise and quick. Tokens: 90 / 160 / 240 / 400 / 700 ms; ease-out cubic-bezier(.16,1,.3,1),
snap cubic-bezier(.2,0,0,1). Feedback on every control; menus and dialogs scale from origin; the
segmented thumb and tab indicator slide; rows wash on hover; the settling sequence is the one
signature moment; connector dot is the only ambient motion. Never animates: body text, table
numbers on idle, layout on scroll in the app.

## Components
Nav: plain bar on marketing with an ink primary; app has a left sidebar (ground) and white content
cards. Buttons: ink primary with inner top highlight; white secondary with border; quiet text
buttons. Inputs: white, 40 px, mint focus ring. Tables: white card, sunk header, 48 px rows, right-
aligned tabular amounts, status pill + five-segment bar. Overlays: white, 22 px radius, float shadow.

## Voice
Plain and exact. "Received" and "Settled" are different words for different facts. Buttons name
the outcome. The interface states that it runs on testnets and that contracts are not audited.

## Never in this project
Cream or paper grounds, serif display type, terracotta or oxide accents, hairline "ledger" styling,
dark neon crypto styling, flat colour-field posters, invented statistics, logos or testimonials,
gradient text, glass as a primary surface.

## Files
Tokens: apps/web/src/app/globals.css. Proposals: .design/directions/index.html.

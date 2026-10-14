# Design brief — Plinth (full redesign, 2026-10-10)

## What it is
A non-custodial USDC payment gateway (fintech / web3 infrastructure). A merchant creates an invoice
and gets a one-time address or a wallet-pay button; a relayer sweeps the payment into a vault only
the merchant controls. Surfaces: marketing site, hosted checkout, merchant dashboard (15 pages).

## Who, where
Founders, finance and ops people at online businesses, and the developers who integrate the API.
Marketing on a laptop, checkout on a phone, dashboard on a desk monitor. They compare with the
best-known payment products and distrust anything that looks like a casino or can freeze funds.

## The one job
In five seconds: "customers pay in USDC, the money lands in a vault I own, nobody in the middle
holds it". Then: create an invoice, watch it settle, withdraw.

## The specific truth
Invoice addresses exist before their contract and can only pay the merchant's vault. "Received"
(final on-chain) and "Settled" (in the vault) are separate and come only from chain facts.
Measured: deploy + sweep about 175k gas paid by the relayer; a customer with zero gas can pay by
signature. Testnet only; contracts not audited yet, and the interface says so.

## Direction given by the owner
**Minimalist, fintech, soft UI, impressive; an attractive landing page.** These words win. The
three options below are interpretations inside that brief, not departures from it.

## Content inventory (only what exists)
- Words: the claim above; how settlement works (detected, verified, final, swept, in vault); two
  checkout methods; vault modes; security model; API and webhooks; honest status (testnet, unaudited).
- Things to look at: the real product UI (checkout, invoice, payments table, vault, webhooks log),
  the settlement flow, network list (Arc, Base and others in the registry).
- Things to do: create a test invoice, open the dashboard, read docs and contracts.
- Real facts: 175k gas deploy + sweep; 0 gas for the customer; 48 contract tests, 84 engine/API tests.
- Missing, to be produced: brand mark, favicon, social image, all section visuals.
- Not available and therefore absent: customer logos, volume, testimonials, audit badge.

## Flows
Merchant: sign up, create vault, create invoice or link, share, watch status, withdraw.
Customer: open checkout, pay by wallet (sign) or send to address (QR), see verified status.
Developer: get key, create payment intent, receive webhook.

## The world
vault, invoice, address, QR, block, confirmation, sweep, relayer, receipt, ledger line, stablecoin,
network, signature, webhook, key, balance, payout.

## Looking around (principles, not looks)
| Studied | Principle extracted | Not taking |
| --- | --- | --- |
| payment and treasury product sites (earlier in this session) | the working product, staged, is the most persuasive image | their palettes and layouts |
| consumer wallets | softness and large type make money feel safe and simple | toy 3D stickers |
| infrastructure sites | one drawing language used from hero to icon | blueprint blue |

Useful conventions to keep: plain headline, visible primary action, product shown early, docs one
click away. Empty conventions to break: stat bands with invented numbers, grey logo rows, dark
neon crypto styling.

## Candidate ideas
1. The product demonstrates itself: a live invoice settles in the hero.
2. Calm depth: money moving as light through a quiet dark field.
3. Soft objects: vault, coins and blocks as tactile forms.
4. The two numbers (received / settled) as the identity.
5. One line from customer to vault that never branches.
6. Checkout as the whole landing page.

Chosen three: **A Daylight** (1 + 5), **B Graphite** (2 + 5), **C Soft Objects** (3 + 4).
Brave: C (tactile 3D for infrastructure). Quiet: A.

## Autopilot, named and set aside
Visual: the rejected cream + serif + oxide "ledger"; dark + neon crypto; purple SaaS cards; and the
flat colour-field poster with heavy condensed type from the parked mocks.
Content: stats band, logo row, testimonials, pricing tiers with invented prices. None are justified
by the inventory except real measured figures used sparingly.

## Axis table (three candidates considered per axis; the pick is shown)
| Axis | A — Daylight | B — Graphite | C — Soft Objects |
| --- | --- | --- | --- |
| Idea | the product settles in front of you | value as light crossing a calm field | money as soft, tactile objects |
| Family (catalog §0) | light airy product × product-led | dark premium tech × soft UI | soft UI × 3D |
| Temperature and value | cool off-white, white surfaces | blue-graphite dark | pale cool grey with pastel tints |
| Colour strategy | mono + one signal (mint green) | tonal blue ramp + one ice-blue signal | multi-accent by meaning (received blue, settled green, pending amber) |
| Type voice | General Sans, medium, tight | Switzer, regular, large light headings | Onest, semibold rounded-geometric |
| Density and pace | balanced | sparse, cinematic hero then dense app | friendly, larger controls |
| Geometry and surface | 14 px radii, soft long shadows, hairline borders | 12 px radii, edge highlights, no drop shadows | 20 px radii, inner + outer soft shadows, tactile |
| Imagery medium | staged real product UI | light field + dot matter (canvas) | CSS 3D soft objects |
| Layout archetype | left statement, product stage right bleeding off | centred statement over a wide field, product below | split with a large object stage, bento below |
| Motion character | precise, quick, one settling sequence | slow ambient field, pulse along the line | springy, weighty objects that drop and settle |
| Tradition crossed | Swiss rigour | technical/blueprint dots | toy/clay materials, kept restrained |

Pairwise differences: A/B 9, A/C 9, B/C 10.
Hard checks: typefaces differ ✓ · ground values differ ✓ · openings differ ✓ · imagery media differ ✓ ·
at most one data-led ✓ (none) · none matches an attractor ✓ · ledger checked ✓ (no reuse of Archivo,
Big Shoulders, Doto, Geist, Instrument Serif, yellow field, cobalt).

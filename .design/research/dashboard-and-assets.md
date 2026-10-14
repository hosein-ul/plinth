# Plinth: dashboard patterns, demo-vs-real spec, real assets, brand directions

Research date: 2026-10-11. Evidence note: web search returned mostly docs, help-centre text and third-party guides. Where a claim is secondhand or could not be confirmed, it is marked "(unverified)". Nothing was copied; this is pattern analysis only. No accounts were created and no files downloaded outside a scratch directory.

---

## 1. Merchant dashboard findings

### 1.1 What the market does (by product)

| Product | Structure and relevant UX (confidence) |
|---|---|
| Stripe | Test mode / sandboxes: up to five named sandboxes switched from the account picker; a "test data" banner at the top of the Dashboard and a notification box on pages whose settings only affect live mode (docs). Activation is an explicit step: you can test everything, then submit business info to turn on live mode (docs). Payments page: date range plus filters for payment method and status (succeeded, refunded, uncaptured); Export lets you pick columns and downloads CSV (help centre). Account checklist progress is stored in the browser, not the account (docs). |
| Lemon Squeezy | Test mode is a toggle at the bottom left of the admin; test mode is a fully separate environment with its own products, customers and orders; new stores start in test mode and must be activated (docs). |
| Mollie | Mode is chosen by key: each website profile has a Live and a Test API key; test data is isolated; test payments expose a checkout URL so you can walk the payer flow (docs). |
| Square | Separate Sandbox with test seller accounts and a Sandbox Dashboard; "Seed data" option fills a test account with simulated customers, items, orders, team members (docs). Limits are explicit (refunds viewable not issuable). Closest precedent to "seeded sample data". |
| Circle Console | Sign-up gives Testnet (sandbox) first; "Access Mainnet" starts onboarding. Left sidebar API Keys: Standard vs Restricted keys with per-product None/Read/Write; key shown once. Webhook subscriptions managed in the dashboard (docs). |
| BitPay | Left-nav Payments view with tabs All / Paid / Unresolved / Invalid; invoice states Paid (awaiting confirmation) -> Confirmed -> Complete (credited to ledger). Search by invoice id, order id or tx hash. Ledgers on Overview, settlement threshold, CSV/QuickBooks export of ledger. Payouts is a gated section; recipients must be invited first; payouts draw from ledger. 2FA recommended (help centre). |
| Coinbase Commerce | Settings holds API keys (Security tab) and "Webhook subscriptions" (add HTTPS endpoint, copy shared secret); currency toggles and domain whitelisting in settings (third-party guides, may be outdated). Charge lifecycle events: created / confirmed / failed. |
| NOWPayments | Separate sandbox host and sandbox dashboard with separate keys; IPN secret under Store Settings -> Instant Payment Notifications; sandbox can simulate success / partially_paid / failure (third-party wrappers, unverified). Statuses: waiting, confirming, finished, partially_paid, failed, expired. |
| Cryptomus | Business -> Merchants -> merchant settings hold merchant id and payment key; separate payout key behind 2FA, regenerating it blocks withdrawals for 24 h (docs). Invoice statuses active / paid / partially paid / expired; webhook resend and test tooling (review, unverified). |
| Helio | No dashboard test toggle found; testing is a separate Devnet API host with separately generated keys; webhook with shared secret sent as Bearer token (docs). |
| Request Finance | One dashboard for invoices, bulk payouts, payroll, expenses, reconciliation and accounting exports (QuickBooks/Xero); on-chain status auto-reconciles invoices (marketing). Onboarding detail not found. |
| CCPayment | No usable documentation surfaced in search; excluded from conclusions. |

### 1.2 Cross-cutting patterns worth adopting

1. Mode is an environment, not a filter. Best practice is two isolated datasets (Lemon Squeezy, Mollie, Circle, Stripe) with a persistent mode indicator. Never mix test and live rows in one table.
2. Keys and webhooks live in one "Developers" area. Key shown once, scoped keys (Circle), webhook secret shown with rotate, a "send test event" and a delivery log with resend (Cryptomus, Commerce).
3. Status vocabulary maps to chain reality: BitPay's Paid -> Confirmed -> Complete is the clearest model of "seen on chain" vs "final". Plinth already has finality policies per network, so expose them.
4. Search by invoice id, order id and tx hash in one box.
5. Export with column picker (Stripe) and ledger-style CSV for accountants (BitPay).
6. Payouts/withdrawals are gated behind verification and ledger funds; for a non-custodial product this section becomes "Settlement addresses" (where funds already go), not a withdrawal flow.
7. Activation is a checklist that ends at "go live" (Stripe, Circle "Access Mainnet"). Plinth analogue: connect network -> add settlement wallet -> create first invoice -> receive a test payment -> add webhook -> enable mainnet.
8. Seeded sample data exists mainly in developer sandboxes (Square). Nobody leads with a public read-only demo; that is an opening for Plinth.

### 1.3 Recommended navigation for Plinth

Overview, Payments (invoices), Payment links, Customers (optional later), Settlement (wallets and networks), Developers (API keys, webhooks, event log, test events), Reports (exports), Team, Settings. Global: environment pill (Testnet / Mainnet), command menu (Ctrl/Cmd+K) to jump and to search invoice id, order id, tx hash, address; notifications bell for failed webhooks, underpaid / overpaid payments, expiring invoices.

Payments table columns: status (with finality progress), amount in USDC, network (chain mark), payer address (truncated, copy), order reference, created, confirmed-at. Filters: status, network, date range, amount, text. Bulk actions: export selected, mark reviewed, resend webhook. Detail drawer/page: timeline (created, seen, confirmed, final), tx hash with explorer link, webhook deliveries with resend, raw event JSON, refund/over/underpayment notes.

---

## 2. Spec: real dashboard vs demo dashboard

### 2.1 Real dashboard (`/dashboard`)

- Shows only real data from the API. No fabricated numbers anywhere, including charts and sparklines.
- Brand-new merchant sees an activation checklist as the home page body, not a zeroed chart grid. Overview renders charts only once there is at least one payment; before that the same area shows the checklist plus one sentence on what appears there.
- Checklist (persisted server-side, not in the browser): 1 Choose networks, 2 Add a settlement address (with a test-signature or small test transfer verification), 3 Create an API key, 4 Create first invoice or payment link, 5 Receive a testnet payment, 6 Add a webhook endpoint and receive a test event, 7 Enable mainnet (blocked until the earlier steps are done and the operational gate in `operationalGate()` passes; surface its `reasons` list verbatim as the blockers).
- Every empty state is written, specific and has one action: Payments empty -> "No payments yet. Create a payment link or send a test payment" with the two buttons; Webhooks empty -> shows the endpoint format and a "Send test event" action; Settlement empty -> "Add the address that receives funds".
- Persistent environment indicator in the header (Testnet or Mainnet) with a different top border colour; testnet pages get a thin banner "Test data. No real funds." Mainnet banner appears only while mainnet is not approved yet.
- Link in the sidebar footer: "See a populated example" -> `/demo`. This is the only bridge between the two.

### 2.2 Demo dashboard (`/demo`)

- Separate route tree, separate layout, no auth, no API calls, no cookies read, no wallet connection. All data is a static typed module shipped with the bundle (deterministic seed so screenshots are stable).
- Read-only: every mutating control is present (so the product looks real) but opens a small "This is sample data" popover with a "Start with your own account" action. Never silently no-op.
- Unmistakable labelling that cannot be missed or cropped: a fixed top bar "Demo with sample data. Nothing here is real." on every page, a "SAMPLE" mark in the header where the environment pill sits (distinct colour from Testnet/Mainnet), and `noindex` plus a visible watermark-free design (no diagonal watermarks; they hurt readability).
- Fully populated: 60 to 90 days of invoices across 4 to 5 networks, mixed statuses (final, confirming, expired, underpaid, overpaid), a refund-like adjustment, webhooks with one failing then resent, three API keys, two team members with roles, a settlement list. Use fictional merchant names and address formats that are clearly synthetic (for example addresses ending in a recognisable repeated pattern) so nobody can mistake them for real addresses.
- Demo tour: optional 4-step guided overlay (overview, a payment detail, webhooks, settlement). Reset on reload; no persistence.
- Data module shares the real UI components and the same TypeScript types as the API client, but injected via a data provider. Real pages take a `DataSource` interface; `/demo` provides `StaticDemoSource`. This keeps the demo from drifting from the real UI and guarantees the real dashboard never imports demo data (enforce with an ESLint `no-restricted-imports` rule on `demo-data/**` outside `/demo`).
- Never reuse real network addresses from `NETWORKS` for sample payer wallets. Sample USDC addresses displayed in the demo should come from the registry only for the token contract field, which is public fact.

---

## 3. Real assets (logos)

### 3.1 Verdict

Use `@web3icons/react` (MIT) as the single source for tokens, networks and wallets. It contains everything Plinth needs including Arc and the seven wallets. Add nothing else. `cryptocurrency-icons` (CC0) is an older set that lacks EURC, Arc, Base, Arbitrum, Optimism and most wallets, so it is not a fit.

Important licensing nuance: the package licence (MIT) covers the compilation and code, not the underlying trademarks. The marks belong to their owners. Practical rule for a payment product: showing a network or token mark to identify that asset (nominative use, like a wallet picker does) is standard; do not alter, recolour, or combine them into your own logo; do not imply endorsement.

Specific brand rules found:
- Circle USDC / Circle brand kit (circle.com/pressroom): use files as supplied, do not distort or edit; clear space 2x on every side; minimum width 120 px for the lockup with wordmark; full-colour icon may sit on light or dark backgrounds with its white parts intact; single-colour only in rare cases with the white knocked out.
- Arc (arc.io/brand-guidelines-and-partner-toolkit): the Arc logo may be used by organisations actively building on Arc or with a signed agreement with Circle; must not imply partnership or endorsement; must not be recoloured, altered, approximated, or made more prominent than your own brand; Circle may request changes within three business days; contact trademarks@circle.com. Plinth builds on Arc, so using the mark as a network label qualifies, but keep it a small identifier, and the web3icons "background" variant (gradient tile) is a third-party redraw: before launch compare it against the official file from the Circle Brand Kit and swap in the official asset if they differ. Also note the web3icons Arc "branded" variant is white-on-transparent and invisible on light backgrounds; use the "background" variant or the official file.
- Wallet marks (MetaMask, Coinbase Wallet, Rainbow, WalletConnect, Phantom, Trust, Ledger) are trademarks of each wallet; use only to indicate "works with" or in a connect-wallet picker, unmodified.

### 3.2 Source table

Verified by installing into `C:\Users\hashe\AppData\Local\Temp\claude\C--Users-hashe-Documents-Workspace\56a611f9-d560-414c-9e5e-2956998fe69a\scratchpad\icons-eval` and listing package files plus rendering them (contact sheet below). `@web3icons/core` 4.0.58, `@web3icons/react` 4.1.24, `cryptocurrency-icons` 0.18.1.

| Asset | Package / source | Licence | Exists | Variants | React component (`@web3icons/react`) |
|---|---|---|---|---|---|
| USDC | @web3icons/react tokens | MIT (mark: Circle) | yes | branded, mono, background | `TokenUSDC` |
| USDT | same | MIT (mark: Tether) | yes | branded, mono, background | `TokenUSDT` |
| EURC | same | MIT (mark: Circle) | yes | branded, mono, background | `TokenEURC` |
| Arc (mainnet and testnet share the mark) | same, networks | MIT (mark: Circle) | yes | branded (white only), mono, background | `NetworkArc` |
| Base / Base Sepolia | same | MIT | yes (branded renders a plain blue square, as the Base mark is) | all three | `NetworkBase` |
| Ethereum | same | MIT | yes | all three | `NetworkEthereum` |
| Arbitrum One | same | MIT | yes (`arbitrum-one`) | all three | `NetworkArbitrumOne` |
| OP Mainnet | same | MIT | yes (`optimism`) | all three | `NetworkOptimism` |
| Polygon PoS | same | MIT | yes (branded is white; use background) | all three | `NetworkPolygon` |
| Avalanche | same | MIT | yes | all three | `NetworkAvalanche` |
| MetaMask, Coinbase Wallet | same, wallets | MIT | yes | branded and background only (no mono) | `WalletMetamask`, `WalletCoinbase` |
| Rainbow, WalletConnect, Phantom, Trust, Ledger | same | MIT | yes | all three | `WalletRainbow`, `WalletWalletConnect`, `WalletPhantom`, `WalletTrust`, `WalletLedger` |
| Testnets | no distinct testnet marks; reuse the parent chain mark plus a "Testnet" text chip | n/a | n/a | n/a | n/a |
| cryptocurrency-icons | npm | CC0-1.0 | partial: USDC, USDT, ETH, MATIC, AVAX only; no EURC, Arc, Base, ARB, OP, wallets | color/white/black/icon | not recommended |

Exact export names for Polygon, Avalanche, Rainbow, Phantom, Trust, Ledger follow the same `Network<Name>` / `Wallet<Name>` pattern; confirm with the editor's type hints after install (Arc, Base, ArbitrumOne, USDC, Metamask, WalletConnect, Coinbase names were verified in the package `.d.ts`).

### 3.3 Install and use (Next.js 16 / React 19)

```
pnpm add @web3icons/react
```

(`@web3icons/core` is pulled in automatically as a dependency. Peer dependency: react 18 or 19.)

Import individual icons for tree-shaking via the subpath exports, which works in Server and Client components (they are plain SVG components):

```tsx
import { TokenUSDC, NetworkArc, NetworkBase, WalletMetamask } from "@web3icons/react";

// size in px, variant: "branded" | "mono" | "background"
<TokenUSDC size={20} variant="branded" />
<NetworkArc size={20} variant="background" />
<WalletMetamask size={24} variant="branded" />
```

Dynamic lookup by symbol or chain, used when rendering from the registry:

```tsx
import { NetworkIcon, TokenIcon } from "@web3icons/react/dynamic"; // async, loads on demand
```

Recommendation: write one tiny `ChainMark`/`TokenMark` wrapper in the app that maps Plinth `NetworkId` -> component (static map, so everything stays tree-shaken and offline, no runtime fetch), picks the `background` variant on light surfaces and `mono` on dark surfaces where needed, and renders a "Testnet" chip for `environment: "testnet"`. Everything is bundled SVG; nothing loads from a CDN.

Offline alternative if bundle size matters: `@web3icons/core` also exports raw files at `@web3icons/core/svgs/networks/branded/arc.svg` style subpaths (see its `exports` map) which can be copied into `public/` at build time.

### 3.4 Contact sheet

`C:\Users\hashe\Documents\Workspace\arcpay\.design\research\icons-contact-sheet.png` (copy of `...\scratchpad\icons-eval\contact-sheet.png`). Shows USDC, USDT, EURC, Arc, Base, Ethereum, Arbitrum One, Optimism, Polygon, Avalanche and the seven wallets in branded, mono and background variants. Observations from it: mono variants are white (for dark surfaces only); Arc branded and Polygon branded are white on transparent; MetaMask and Coinbase lack mono; Base branded is a solid blue square.

---

## 4. What makes fintech branding feel production grade

Observations (mix of case-study text and general practice; some single-source):
- Wise's rebrand (Ragged Edge) kept the wordmark and flag icon, re-crafted for legibility, then built a distinctive asset set around it: a proprietary typeface, colour as a core asset (green), and graphic "tapestries" for backgrounds; motion is part of the brand definition.
- Ramp's work (Bakkenbaeck) built a scalable product-graphic system and defined colour, type scales and motion expressions together, so marketing and product share one language.
- Mercury's campaigns (Instrument) lean on typography, still-life photography and structured grids rather than fintech clichés.
- Stripe: sources disagree on details; the lasting lesson is one strong colour, a confident wordmark, and brand and docs sharing the same visual language (unverified specifics).

Checklist for Plinth:
1. Logo system: symbol alone, wordmark alone, lockup, minimum sizes and clear space defined relative to a unit; works at 16 px favicon and in one colour.
2. Wordmark: custom-tuned letters (spacing, one or two modified glyphs), not a typeface typed out.
3. Favicon set: SVG favicon with `prefers-color-scheme` handling, 32 and 180 px PNG, maskable app icon.
4. Open Graph: templated, generated at build (`next/og`), one per page type with the real title.
5. Brand page (`/brand`): downloadable marks, colours, usage dos and don'ts; also the right place to state how Plinth uses Circle and Arc marks.
6. Motion logo: a 1 to 2 second build-up of the mark (used in loading and the hero), with a static reduced-motion fallback.
7. Iconography: one icon set (Lucide or Phosphor) at one stroke width, plus the chain and token marks from section 3 used consistently in the same slot sizes.
8. Document and receipt templates (PDF invoice, email) carrying the same system.

---

## 5. Three brand directions for Plinth (words only)

Context: "Plinth" is the base that supports something placed on it. Current mark: rounded black square with a white base block.

**Direction A: "The Pedestal"**
Idea: the product is the quiet foundation under money someone else sees. The mark stays a solid base but gains a clear second element: a thin, lighter slab resting on the base, which doubles as the "coin on a plinth" and as a stacked-layers hint for settlement. Wordmark in a wide, grounded grotesque with generous tracking, all lowercase or small caps. Colour: a deep mineral ink with one confident signal colour reserved for "confirmed" states, so brand colour equals product meaning. Motion: the slab settles onto the base with a short, weighted ease; the same motion plays when a payment turns final.

**Direction B: "Load Path"**
Idea: engineering metaphor, force travelling down to solid ground. The mark is a minimal column-and-base glyph read from the side, with the horizontal base being the dominant stroke. Typography: a technical but warm serif-free system with a mono companion for addresses and hashes. Colour: concrete and stone neutrals with a single oxidised-metal accent used sparingly. Visual language: architectural section drawings and blueprint line work as the bespoke illustration style, each chain shown as a "foundation" the base sits on. Motion: lines draw in like construction, then lock.

**Direction C: "Museum Label"**
Idea: a plinth displays an object; Plinth displays the payment. The mark becomes a pure geometric pedestal silhouette (two stacked rectangles of different widths) that can hold a changing item: the USDC mark, a network mark, or an amount, on top. This makes the brand mark itself a slot that adapts per context (invoice, receipt, checkout), a flexible identity like Ramp's system approach. Typography: refined editorial sans with tabular figures for amounts. Colour: warm off-grey gallery wall with ink and one vivid accent that changes by network context but never leaves the palette. Motion: the item rises onto the plinth when a payment lands.

Each direction keeps the base-block idea so the existing mark evolves rather than being discarded, and each treats the third-party chain and token marks as guests that sit on the plinth, never altered, which also satisfies the Circle and Arc usage rules.

---

## 6. Open items / risks

- Confirm the web3icons Arc artwork against the official Circle Brand Kit before public launch (Arc guidelines forbid recreating or approximating the logo).
- Contact trademarks@circle.com if Plinth wants to use the Arc mark in marketing beyond a network label.
- `@web3icons/react` has thousands of icons; always import by name or via the static map so the bundle stays small.
- Search coverage for NOWPayments, CCPayment, Helio, Cryptomus and Request Finance dashboards was thin; claims marked secondhand should be rechecked against live docs if they become decision-critical.

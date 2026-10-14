# Daylight rebuild: critique (2026-10-11)

## What was checked
- `npx tsc --noEmit -p .` in `apps/web`: clean.
- `slop-check.mjs apps/web/src`: 90 files, 0 FAIL, 0 WARN.
- Headless Chromium screenshots of 28 routes at 1440x900 and 390x844, against the local stack with six
  sandbox payments (settled, confirming, overpaid, unpaid): horizontal page overflow is 0 on every route
  at both widths; no console errors after fixes.
- Looked at by eye: landing (desktop, mobile), developers, checkout (open), dashboard overview,
  payments list, payment detail (desktop, mobile), API keys, audit log, wallets, dashboard networks.

## Fixed during review
- Audit log requested `limit=200` (API max is 100) and always showed the error state.
- API keys page had a hydration mismatch from a `typeof window` branch in the quickstart URL.
- Payment rows on phones wrapped the ID over two lines and pushed the amount out of view.

## Not checked by eye
- Screens captured but not opened: networks, security, pricing, status, contact, login, signup, not-found,
  transactions, payment links, invoices, settlements, refunds, webhooks, webhook logs, team, settings,
  paid checkout.
- Dialogs and flows: create payment, refund, create link/invoice, new API key secret reveal, webhook
  create, vault create, withdraw and policy change (need a browser wallet).
- Hover, focus-visible and reduced-motion behaviour; scroll-spy on the developers page.
- Link-start page (`/l/[slug]`) with a real link; `error.tsx` boundaries.

## Known weak spots
- Landing: the gap between the hero and the first section is larger than the rhythm elsewhere.
- Detail tables on phones scroll sideways inside their card rather than restacking.
- `layout.tsx` has no `metadataBase`; OG/icon URLs need it in production.
- `Code` has no copy button; `PageIntro` does not use the two-tone headline.

---

# Round 2 (2026-10-11): production-grade pass

Research: `.design/research/{landing-benchmark,checkout-benchmark,dashboard-and-assets}.md`.
Evidence caveat: several competitor checkouts could not be fetched (403/404); claims are tagged in the files.

## Built
- Brand: new "Pedestal" mark (rect + circle only), wordmark, favicon/OG, `/brand` page with downloadable SVGs.
- Real assets: `@web3icons/react` token, chain and wallet marks via `components/brand`; testnets reuse the parent mark + Testnet chip.
- Wallet connect: EIP-6963 detected wallets, curated list, WalletConnect when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, wrong-network banner with switch.
- Landing: 11 sections, pinned scroll sequence, live `/public/status` block, wallet marquee, honest status block; all earlier made-up figures removed.
- Checkout: network selector, authoritative amount, status thread, framed QR with USDC mark and EIP-681 link, request echo before signing, 15+ state panels, receipt, mobile pay bar.
- Site: use-cases, integrations, faq, compare, brand, legal drafts, sitemap, robots; pricing corrected (no fee is implemented).
- Dashboard: real data only, activation checklist, specific empty states; `/demo` is a separate route tree on static sample data with a fixed "Demo" bar; `check:demo-isolation` enforces the separation.

## Checked
- tsc clean; slop-check 163 files, 0 FAIL, 1 WARN (template-skeleton, kept deliberately).
- 40 routes at 1440 and 390: no horizontal overflow, no console errors.
- By eye: landing scroll-through, checkout (open, expired, complete), demo overview, brand page, plus earlier dashboard screens.

## Not verified
- Wallet signing end to end, WalletConnect pairing, mobile deep links (no wallet in headless; no project id).
- Brand-new account first-run (no vault, no payments) and its empty states.
- Late-payment and wrong-token states against a real backend (UI seen with intercepted payloads).
- Printed receipt output; `/l/<slug>` with a real link; production build (only dev server used).
- Arc and Polygon marks are third-party redraws: compare with Circle's official brand kit before launch.

## Needs owner input
- Legal entity, address, governing law, privacy contact; counsel review of the three legal drafts.
- `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SECURITY_EMAIL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, WalletConnect project id.

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

## 2026-10-15 — Payout methods, email, fee surfaces (inside Daylight, inherit rules)
Scope: Wallets & payouts (payout cards, wallet-proof dialog, switch-to-vault), Settings email block, vault owner proof form,
/verify-email and /confirm-payout pages, fee and net on overview, payment detail and settlements.
Looked at (real local stack, production build): desktop 1280 and phone 375 of the wallets page; the dialog through all four
steps with a dev wallet shim; email confirmation page before and after use; payout confirmation; settings page text.
Fixed after looking: the Vault / My wallet switch looked clickable and did nothing (now real buttons); locked steps were
clickable (now inert); step 1 said "confirmed" while unconfirmed; the connected address was printed twice; fee note too long on phones.
Not checked: Web3Auth re-authentication in a browser (needs a live Web3Auth project), tablet width, the vault owner dialog with a real wallet,
dark appearance (the product has none). slop-check ran on the new component files; its page-level findings (font, focus, reduced motion)
do not apply to fragments and the global stylesheet already carries reduced-motion handling.

## 2026-10-15 — payment token (USDC / EURC) in checkout and dashboard
Mode: inherit (Daylight). New parts: `TokenPicker` (the existing segmented Tabs control with the token mark from `@web3icons/react`), per-token rows in Networks & assets, currency-aware Amount unit. No new colours, type or motion.
- Checked in the browser against the local stack with a real EURC payment: checkout (desktop and 375 px, wallet and address tabs), receipt, overview with the picker, Networks & assets, new-invoice dialog.
- The picker only renders when the merchant can take two or more tokens; a USDC-only merchant sees exactly what they saw before.
- Not checked: Telegram fork visually (files are identical copies, typechecked), dark mode, real wallet signing for EURC (engine tests cover EIP-3009 for EURC).

## 2026-10-15 — custody (custodial payout mode)
Mode: inherit (Daylight). New: `/dashboard/custody` (balance per token as the two-number Amount, withdraw dialog, automatic-payout dialog, withdrawals ledger) and a third "Held by Plinth" segment in the payout switcher. Existing tokens only; the page is hidden from the nav unless an operator turned custody on. The page opens with the same warn Notice every time: this is the one mode where the platform holds the money.
- Checked in the browser against a local stack with custody on: balance, withdraw dialog, a real withdrawal from the UI through to CONFIRMED on-chain.
- Not checked: mobile width, the custodial wallet-registration dialog in the browser (the engine and API flow are tested), dark mode, the Telegram fork visually (identical files).
- Known: a hydration warning appeared in dev on first load of the page (server rendered data, client rendered the skeleton); not investigated.

## 2026-10-15 — one landing for both audiences (branch super-landing)
Mode: inherit (Daylight). The Telegram fork's home page and the main site's home page were merged into `apps/web`. New order: chat hero (glass wave behind the chat phone), audience, thesis diagram, sellers, four steps, two ways to get paid, address-before-contract and who-can-do-what, two ways to pay, dashboard, networks, builder section, status, FAQ, closing. The chat components moved from `apps/telegram` into `apps/web/src/components/chat`; `apps/telegram` is untouched.
- Changed copy: the "$1.4B revenue" tile (a Telegram figure from secondary coverage, not about the seller) is now "0.20% per payment", taken from the pricing page. The hero no longer says "every network that has USDC" because only testnets run; it says "the network your customer already uses". FAQ: three Telegram questions first, one "Is this a Telegram product?" last.
- Changed layout: the networks section listed one dashed row per mainnet (24 rows, about 1,500 px on a phone); it is now one compact list of chips. Phone page height went from 23,560 px to 22,057 px.
- Checked in the browser on a production build: desktop 1440 wide and phone 375 wide with touch, every section scrolled into view, no horizontal overflow (scrollWidth equals clientWidth at both widths), FAQ open state, the chip list. Page height is 15,300 px on desktop and 22,000 px on a phone.
- slop-check on `apps/web/src`: 0 FAIL, 3 WARN (card-kit, fade-up, template-skeleton), all present before this change.
- Known weak spots: the page is long on a phone (about 27 screens); candidates to cut are the dashboard preview, one of the two dark explainer bands and the builder section. The hero video plays on phones as before (not profiled). No peer comparison and no score table were done for this change. Not checked: tablet width, a real device, dark mode (the product has none), the Telegram app's hero shader (not carried over).

Addendum, same day: the hero visual is now two channels, the hosted checkout in a desktop browser (from the xl breakpoint up) next to the chat phone; below xl it is the phone alone. The headline reads "Get paid in USDC, wherever you already sell" because the product is not limited to Telegram. The networks section lists all 24 mainnets in a two-row marquee with their marks (23 real marks from @web3icons/react, one honest fallback for Morph, which the package does not have); the "switched off" chip list is gone and the copy says the testnets run today and each mainnet opens after its own check and the audit. Deployed to the Vercel project plinth (production, Root Directory apps/web). Checked on the live URL: desktop 1440, no horizontal overflow, no console errors, the video loads. Not re-checked on a phone after this change.

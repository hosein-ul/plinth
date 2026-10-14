# Hosted checkout benchmark for Plinth

Scope: non-custodial multi-chain USDC gateway, testnet only today.
Purpose: extract patterns and details from serious crypto gateways. Nothing here is to be copied; it feeds the Plinth checkout redesign.

## 0. Method and honesty about evidence

Research was done through web search, doc fetches and one browser visit (Stripe docs). Most gateways do not publish pixel-level screenshots of their payer page, and several help pages returned 403/404 or only describe behaviour in text. Each claim below is tagged:

- [V] verified in a fetched official doc or help page this session.
- [S] stated in a search-result summary of an official source, not independently opened.
- [K] general product knowledge of how the pattern is commonly built; not verified this session. Treat as a hypothesis to check by walking a live test invoice.
- [?] could not be established. Left open on purpose.

No accounts were created, nothing was paid, nothing was downloaded.

Sources used: Stripe stablecoin docs (docs.stripe.com/payments/stablecoin-payments) [V]; BitPay payment flow guide, invoice states, support articles on expiry and payment options [V for flow guide, S for the rest]; Coinbase Business Checkouts API reference and Commerce FAQ and migration mapping [S]; NOWPayments help and blog (statuses, refund policy, network guidance) [S]; Cryptomus FAQ on underpaid invoices [S]; CoinPayments, Coindirect, OpenNode, Cryptopay, Lunu docs on exceptions [S]; CoinGate WalletConnect announcement [V]; WalletConnect Pay docs for users [V]; EIP-6963 specification [V]; Helio quick start and WordPress plugin captions [S]; Request Finance and CCPayment: no usable payer-page documentation found [?].

## 1. Per-product notes

### 1.1 Stripe (stablecoin payments inside Checkout / Payment Links / Elements)
- Flow [V]: buyer picks "Crypto" among normal payment methods, is redirected to a Stripe-hosted crypto page (crypto.stripe.com), selects currency and payment network, connects a wallet, signs. Then a notification of completion, then an optional redirect back to the merchant.
- Asset/network model [V]: USDC on Tempo, Ethereum, Solana, Polygon, Base; USDP and USDG restricted to US. Customer chooses token, wallet and network. Settlement happens in the merchant's fiat balance, so no address-based flow is exposed at all.
- Limits stated up front [V]: US$10,000 per transaction. Refunds go back as stablecoins to the original wallet. No chargebacks because the customer authenticates.
- Takeaways: the pay step is a wallet-signed transfer, not a send-to-address flow; network is a first-class choice next to token; merchant branding and order summary are inherited from Checkout (left summary, right payment panel is the Stripe house layout [K]); the return-to-merchant redirect is explicitly optional.

### 1.2 BitPay (invoice page)
- Steps in order [V]: choose wallet/app/exchange to pay from; enter email (used for payment issues); choose cryptocurrency; pay by scanning a QR or pasting a payment URL (BIP70-style Payment Protocol or Lightning wallets) or, for wallets without those, copy address and amount manually.
- Wallet guidance [V]: the page separates "Payment Protocol compatible" wallets from others and warns that others carry a higher risk of payment issues. This is a trust and error-prevention device, not decoration.
- Expiry [S]: invoices are valid for 15 minutes. A payment arriving after expiry is declined and the payer is emailed; the payer must return to the merchant for a new invoice.
- Exceptions [V/S]: underpaid, overpaid, late and duplicate are all handled by email plus automatic refund or claim link; underpaid and overpaid handling applies to BTC, BCH, XRP, not ETH or stablecoins. Merchant sees "paid" then "confirmed" then "complete"; "paid" is not a settlement guarantee.
- Takeaways: email capture early, tied to a concrete promise ("so we can reach you if something goes wrong"); a visible compatibility split between easy path and risky path; countdown exists but is not described textually, check live [?].

### 1.3 NOWPayments
- Statuses [S]: waiting, confirming, confirmed, sending, partially paid, finished, failed, refunded, expired. Expiry window is up to 7 days from creation in the help text (payment page timer is shorter in practice [?]).
- Partially paid [S]: funds arrived but less than price; the customer can usually send the remainder to the same address. Wrong network or wrong asset deposits may be auto-processed if enabled and supported, else manual support with a payment ID.
- Support model [S]: support asks for the payment ID. The payment ID is therefore a visible, copyable item on the payer page [K].
- Takeaways: partially-paid is a live state with "remaining amount" rather than a failure; payment ID is the support handle; wrong-network is a documented, recoverable-sometimes class, and the public blog devotes a post to "pay on the right blockchain", which indicates the page repeats that warning.

### 1.4 Coinbase Commerce / Coinbase Business Checkouts
- Statuses [S]: ACTIVE, PROCESSING, COMPLETED, EXPIRED, FAILED, DEACTIVATED, REFUNDED, PARTIALLY_REFUNDED (legacy: NEW, PENDING, COMPLETED, EXPIRED, FAILED). Legacy FAQ says charges cannot be under or overpaid because exactness is enforced (wallet-signed exact transfer through a contract path) [S].
- Merchant guidance [S]: act on pending only with reorg risk understood; confirmed is safer.
- Notice [S, third-party]: legacy Commerce reported closing after 31 March 2026. Verify before citing.
- Takeaways: exactness-by-construction removes the whole under/over class; Plinth can borrow this only if its contract flow enforces exact amount.

### 1.5 Cryptomus, CoinPayments, Coindirect, OpenNode, Cryptopay, Lunu (exception handling)
- Underpaid shows both amount received and amount still to pay [S, Lunu].
- Wallets that deduct network fee from the sent amount are a named cause of underpayment [S, Coindirect]; the fix is to say "network fee is paid by you on top of this amount".
- OpenNode lets the buyer choose to send the remainder or cancel with return of funds on its hosted checkout [S].
- Cryptopay freezes the rate for 10 minutes and moves late payments to an unresolved status with a "paid late" context [S].
- CoinPayments: the fiat figure ignores network fees, so refer to the crypto amount [S].
- Cryptomus: merchant can surcharge to cover the gap or refund to an address the payer supplies [S].

### 1.6 CoinGate WalletConnect flow (wallet-connect reference)
Verified sequence [V]: choose "Pay with WalletConnect"; select a wallet in browser or scan QR with mobile; approve connection; system checks the wallet is on a supported network and has enough balance; token list filtered by wallet balances ("only funded wallets will be allowed to proceed"); optional billing details if compliance needs; review amount, address, network; sign; broadcast; backend watches chain and marks paid.

### 1.7 WalletConnect Pay (user docs)
[V] Scan QR in a supporting wallet, or scan with phone camera which opens a mobile web payment page and then connect. Wallet shows amount, what for, recipient; user picks token and network; approves; waits for result. Pre-approval advice: check amount, network (fees and speed differ), destination. Explicit "never enter a seed phrase" warning.

### 1.8 Helio
[S] Pay link / checkout widget; merchant sets product, image, price, chains, payout wallets; options include swaps (pay with a token other than the priced one), card on-ramp, dynamic pricing, collecting customer and shipping info, discounts. Buyer steps from plugin captions: connect wallet, swap tokens, approve transaction, order details. Takeaway: one-product pay page with an image, and "order details" as a final receipt screen.

### 1.9 Request Finance, CCPayment
[?] No payer-page documentation retrievable. Request Finance is invoice-first (fiat-denominated invoice, crypto payment option) per search summaries. CCPayment: nothing found. Do not claim parity with either.

### 1.10 Wallet-modal references (RainbowKit / WalletConnect modal / Coinbase Wallet SDK)
[K] Wallet list with brand icons and a small "Installed" or "Recent" tag; a "More wallets / WalletConnect" entry that switches to a QR view with a "Copy link" action and a "Open in app" link on mobile; account and chain pill after connect; chain switch via a dropdown with chain logos and a "Wrong network" red state. Not verified this session; walk the RainbowKit demo before finalising.

## 2. State matrix

Legend: Y = shown as its own state, N = not applicable/not documented, ~ = handled outside the page (email, support, merchant).

| State | Stripe | BitPay | NOWPayments | Coinbase | Others (OpenNode, Lunu, Cryptopay) | Plinth should |
|---|---|---|---|---|---|---|
| Awaiting payment | Y (wallet connect page) | Y (QR + countdown) | Y waiting | Y ACTIVE | Y | Y: two paths, one timer |
| Wallet connected, not signed | Y | N | N | N | N | Y: "approve in your wallet" step with request echo |
| Broadcast / seen, unconfirmed | Y notification | Y paid | Y confirming | Y PROCESSING | Y | Y: tx hash, explorer link, confirmation counter |
| Confirmed / complete | Y | Y complete | Y finished | Y COMPLETED | Y | Y: receipt |
| Underpaid | N | ~ email + refund (not stablecoins) | Y partially paid, send remainder | N (exact) | Y shows received and remaining, remainder or cancel | Y: received, remaining, same address stays live |
| Overpaid | N | ~ email, claim excess (not stablecoins) | ~ | N | ~ CoinPayments auto-refund | Y: credited, excess amount shown, honest about refund path |
| Expired | Y | Y page + email if late pay | Y expired | Y EXPIRED | Y | Y: new session button, "if you already sent" help |
| Late payment | N | ~ merchant manual approve | ~ | N | Y "paid late" unresolved | Y: show as detected-after-expiry, hold for merchant |
| Wrong network | N (network chosen first) | N | ~ auto-process or support | N | ~ | Y: pre-send warning + post-detect explanation |
| Wrong asset | N | N | ~ | N | ~ | Y if detectable; otherwise pre-send warning |
| Duplicate payment | N | ~ refund via support | ~ | N | ~ | Y: second transfer flagged, not credited |
| Failed / rejected signature | Y | N | Y failed | Y FAILED | Y | Y: wallet reject vs on-chain revert, distinct copy |
| Cancelled by merchant | N | N | N | Y DEACTIVATED | N | Y |
| Refunded | N | ~ | Y refunded | Y REFUNDED | Y | Only if Plinth truly refunds; otherwise omit |

## 3. Twenty-five prioritised UI/UX details

P0 (must have, correctness and trust)
1. One authoritative amount block: exact USDC amount to send, monospace tabular figures, copy button, with the unit "USDC" and chain name adjacent. Everything else defers to it.
2. Network is chosen before address or wallet appears, and the chosen chain's logo and name stay visible in the card header and above the QR. Nothing is shown that is valid for only one chain without naming it.
3. "Send exactly this on this network" warning attached directly to the address block, not in a footer. Short, specific text naming the chain and USDC contract-level asset, with a link to a one-line explanation of what happens otherwise.
4. Single countdown with two thresholds: neutral until the last minute, then a stronger state; never silently reset. Tabular numerals, and the expiry also shown as clock time for assistive tech. Announce at 1 minute via polite live region only.
5. Live status line that is real: waiting for payment, transaction seen (with hash link), n of N confirmations, complete. Each step is driven by observed chain data; do not animate fake progress.
6. Payment reference and payment ID shown in the summary with copy. Support asks for it; so should the page, under a "Need help?" disclosure that prefills it.
7. Underpaid state shows received, required, remaining in three aligned rows, and keeps the same address live for the remainder while time allows.
8. Overpaid state says the invoice is satisfied, shows excess, and states plainly what Plinth can and cannot return (see section 7).
9. Expired state: one primary action "Start a new payment", plus a visible "Already sent funds?" disclosure with the reference and a support path. Never leave a dead end.
10. Wrong-network wallet state: a blocking inline banner with the connected chain, the required chain, and one "Switch to <chain>" button; the pay button is disabled with a reason, not hidden.

P1 (high-value polish)
11. Order summary left column with merchant name and logo (or monogram fallback), line items if the merchant supplied them, reference, and total; sticks on desktop and collapses into a top bar on mobile.
12. Asset and chain selector as a segmented list with real logos, per-chain estimated fee text only where Plinth can compute it, and a "recommended" mark only if backed by real data such as lowest known gas for that chain.
13. QR framed with a quiet zone, high error correction, USDC mark in the centre kept under about 20% of area, and an "address only" versus "payment URI (EIP-681)" toggle only if wallets honour the amount parameter; otherwise show address QR plus separate amount copy.
14. Address display: grouped monospace, first and last 6 characters emphasised, full copy button with "Copied" confirmation that also announces via live region, and a "show full address" for screen readers.
15. Memo/tag note: state explicitly "no memo needed" for EVM chains, so users coming from exchanges do not hunt for one. If a non-EVM chain is ever added, show memo as a required field with the same weight as the address.
16. Wallet path and address path are peers in one card (tabs or a two-option choice), and the page remembers the last choice in this session.
17. Email capture is optional, placed after the pay UI is usable, with a specific promise (receipt and problem notices), not a gate.
18. Receipt screen: amount, chain, tx hash with explorer link, timestamp, reference, merchant, "Back to merchant" primary, "Download receipt" secondary (print stylesheet is enough).
19. "Back to merchant" button appears on every terminal state with the right label (return to store vs try again), and auto-redirect only on success with a visible cancel for the countdown.
20. Persistent help affordance: help link, status page link if one exists, contact. Keep one place, not scattered.

P2 (refinement)
21. Mobile layout: summary collapsed to a single amount bar, the pay card full-bleed, primary action pinned at the bottom with safe-area inset, QR hidden behind "Show QR" when a wallet deep link is the main path.
22. Motion with meaning: status step transitions at 150 to 250 ms, a single check draw on completion, countdown colour change without flashing; all motion removed under prefers-reduced-motion.
23. Trust row that is truthful: "non-custodial", "funds go to the merchant's address", link to the contract/address on the explorer. No invented badges, certifications or logos.
24. Language and currency switchers only when real: the page can ship in more than one language; a currency switcher is omitted until there is a rate source (section 7).
25. Accessibility: tabs follow the ARIA tabs pattern, QR has a text alternative equal to the address, status changes use role="status", focus moves to the result heading on terminal states, 4.5:1 contrast verified, touch targets 44 px minimum.

## 4. Wallet-connection UX specification

### 4.1 Entry
- Button label "Pay with wallet" opens a wallet sheet (centered modal on desktop, bottom sheet on mobile). The sheet title states the amount and chain so the payer knows what they are connecting for.

### 4.2 Wallet list
- Source order: (1) wallets discovered through EIP-6963 on this page, labelled "Detected"; (2) last used wallet from local storage, labelled "Recent"; (3) a curated static list of popular wallets with icons, labelled "Install" or "Open app" depending on device; (4) "WalletConnect" entry with its own QR view.
- Detection [V, EIP-6963]: register a permanent `eip6963:announceProvider` listener first, then dispatch `eip6963:requestProvider`. Each announcement carries `info` with `uuid`, `name`, `icon` (data URI, square, ideally 96 px or more), `rdns`, plus the `provider`. Render the icon through an `<img>` element only, never inline the SVG (the spec says this blocks script execution). Treat `rdns` as a self-attested label, not as proof of identity or capability. De-duplicate by `rdns`. Do not rely on `window.ethereum` except as a legacy fallback, and when falling back, label it "Browser wallet".
- Never auto-connect on load. Connect only after an explicit click.
- Empty detection on desktop: show the curated list with install links and the WalletConnect option; on mobile: deep links.

### 4.3 WalletConnect
- QR view inside the same sheet with: QR, "Copy link", short instruction "Scan with your wallet app", a back button, and a timeout state with "Refresh QR". Pairing URIs expire; regenerate on retry.
- Request only the chains Plinth supports, as required namespaces limited to the selected chain, to avoid an unneeded multi-chain approval prompt in the wallet.
- WalletConnect Pay is a separate product with its own flow [V]: the payer scans in a supporting wallet which then shows amount, purpose, recipient. Only claim support if integrated.

### 4.4 Mobile deep links
- On mobile, wallet rows open the wallet app with a WalletConnect URI (universal link or custom scheme from the wallet's registry entry), then the browser tab waits for the session. Show a "Waiting for <wallet>" state with a manual "Open again" and "Copy link" fallback, since app switching often drops the tab.
- When returning from the wallet, re-check session and payment status immediately on `visibilitychange`.
- Offer a "Pay by sending to address" fallback when no wallet is installed; this is the lowest-friction mobile path for exchange users.

### 4.5 In-wallet browser
- Detect via injected provider flags and EIP-6963 announcement present at load. When the page runs inside a wallet's in-app browser, skip the list: show a single "Connect <wallet name>" button using the announced provider, because the wallet is already present.
- Hide the WalletConnect QR option in that case (scanning your own phone is meaningless).
- Do not open external deep links from inside a wallet browser; stay in-page.

### 4.6 Connected state
- Compact account pill: wallet icon, truncated address, chain badge, disconnect menu. Show the connected chain and the required chain whenever they differ.
- Balance check [V, CoinGate pattern]: read USDC balance on the required chain; if below the amount show "Balance 12.00 USDC, you need 25.00 USDC" and disable pay, offering the address path as the alternative. Only do this if the read is reliable; otherwise do not block.

### 4.7 Chain switching
- Use `wallet_switchEthereumChain` first; on error code 4902 (unknown chain) call `wallet_addEthereumChain` with the chain's real parameters from configuration, never from user input. Show a three-state button: "Switch to <chain>", "Check your wallet" (pending), "Switched" then auto-advance.
- If the user rejects, keep the banner, no error styling beyond a neutral line "Switch needed to continue". If the wallet does not support programmatic switching, instruct to switch manually and re-check on `chainChanged`.
- Listen to `chainChanged` and `accountsChanged`; on account change mid-payment, re-validate rather than reloading.

### 4.8 Signing prompts
- Before opening the wallet, show a request echo: amount, token, recipient address (truncated with full on tap), network, estimated network fee only if estimated live. After the click, show "Confirm in your wallet" with the wallet icon and a way to cancel.
- Two steps if an approval is needed: label them "1 of 2 Approve" and "2 of 2 Pay"; skip the approval step entirely when the flow is a direct transfer.
- Never ask for message signatures unrelated to the payment. State "Plinth will never ask for your seed phrase" once, near the connect action.

### 4.9 Error states (distinct copy for each)
- User rejected request: neutral, "Request cancelled", retry button.
- Wrong network: see 4.7.
- Insufficient USDC: show balance vs needed, offer address path.
- Insufficient native gas: name the native token of that chain and the shortfall only if known.
- Transaction reverted on-chain: show hash, explorer link, "Nothing was paid" only if verified, retry.
- Replaced/dropped transaction: "Transaction was replaced"; keep watching for the payment.
- RPC or network error: "Cannot reach the network", auto-retry with backoff, manual retry.
- Session expired during signing: offer a new session while preserving the entered email.
- Wallet disconnected: return to wallet list with "Reconnect".

## 5. Recommended layout for Plinth

Principles: the summary is a receipt-in-progress (left), the action is a single focused card (right), status is a continuous thread rather than a separate list, and the whole page reads as one transaction. Merchant brand sits top-left of the summary; Plinth is a quiet "Powered by" at the bottom of the summary, not the hero.

### 5.1 Desktop (about 1120 px content width: 5/12 summary, 7/12 payment)

```
+--------------------------------------------------------------------------------+
| [Merchant mark] Merchant name                         Help   EN v   (timer 14:32)|
+---------------------------------+----------------------------------------------+
| ORDER SUMMARY                   |  1  Network      2  Pay      3  Done         |
|                                 |  ------------------------------------------- |
| Total                           |  Network                                     |
| 25.00 USDC                      |  ( Arc Testnet ) ( Base Sepolia ) ( ... )    |
|                                 |  logo+name chips, selected one filled        |
| Line items (if supplied)        |                                              |
|  Item A ............ 20.00      |  +----------------------------------------+  |
|  Item B .............  5.00      |  | [Pay with wallet] [Send to address]    |  |
|                                 |  +----------------------------------------+  |
| Network fee: paid by you,       |  Wallet tab:                                 |
| not included above              |   [ Detected wallet icons ... ]              |
|                                 |   [ Connect wallet ]                         |
| Reference  PL-8F3K2   [copy]    |  Address tab:                                |
| Payment ID 01HX...    [copy]    |   +--------+  Send exactly                   |
| Expires    14:32 (12:41 UTC)    |   |  QR    |  25.00 USDC [copy]              |
|                                 |   |  w/mk  |  on Arc Testnet                 |
| Status thread                   |   +--------+  0xAbC1...9f2E [copy]           |
|  o Waiting for payment          |   ! Only USDC on Arc Testnet. Other          |
|  . Transaction seen             |     assets or networks may be lost.          |
|  . Confirmations 0/N            |   Email for receipt (optional) [        ]    |
|  . Complete                     |                                              |
|                                 |  Non-custodial: funds go to the merchant.    |
| Powered by Plinth               |  View receiving address on explorer          |
+---------------------------------+----------------------------------------------+
```

Notes: the status thread lives in the left column so the right card can change content (wallet request, receipt) without losing context. Terminal states replace the right card with a result panel carrying the primary action.

### 5.2 Mobile (375 px)

```
+--------------------------------+
| [mark] Merchant      14:32  ?  |
| Total 25.00 USDC       [v]     |   collapsed summary, tap to expand
+--------------------------------+
| Network                        |
| (Arc Testnet)(Base Sep.)(..)   |   horizontal chips
|                                |
| [Wallet] [Address]             |
|                                |
| Wallet: wallet rows with icons |
|  Detected / Recent / More      |
|  Open in <wallet app>          |
|                                |
| Address: Send exactly          |
|  25.00 USDC [copy]             |
|  0xAbC1...9f2E [copy]          |
|  [Show QR]                     |
|  ! Only USDC on Arc Testnet    |
|                                |
| Status: o Waiting for payment  |
| Email (optional)               |
+--------------------------------+
| [   Pay 25.00 USDC   ]         |   sticky, safe-area padded
+--------------------------------+
```

### 5.3 What replaces the current five-step list
Keep it as the status thread, but bind each step to a real on-chain observation and show hash and counts, as in details 5 and 6.

## 6. Fit to current Plinth structure
- Current: left summary plus right card with two tabs and a 5-step list. The structure is right; the weaknesses are shallow summary content, absence of network as a first-class selector, no exception states, no wallet-list depth, no receipt, and a status list that is separate from the actions.
- Order of work: (1) state machine and copy for all states in section 2, (2) network selector and amount block, (3) wallet sheet per section 4, (4) receipt and terminal panels, (5) mobile sticky action, (6) motion and accessibility pass.

## 7. What Plinth can truthfully show

- Asset: USDC only. Do not show other tokens, swaps, or "pay with any token".
- Fiat: there is no rate service. Do not show a fiat equivalent, a locked rate, or a rate countdown. If the merchant priced in USDC, show USDC only. Optional: display the merchant-supplied currency label only as plain text if it is exact-equal 1 USDC = 1 USD, and even then avoid stating a rate; the safest option is to omit fiat entirely until a rate source exists. A rate-lock UI should be designed but left unbuilt.
- Network: testnet only. Show testnet chain names exactly as configured and label the page as test mode with a persistent, non-alarming badge ("Test mode - no real funds"). Never imply mainnet.
- Fees: only show network fee if it is fetched live; otherwise say "network fee is paid by you in addition to the amount" without a number. Do not invent a Plinth fee line unless the product defines one.
- Under and over payment: show them only for the address path, where they can occur. If the wallet path enforces exact transfer, state exactness there.
- Refunds: do not promise automatic refunds. Plinth is non-custodial: funds go to the merchant's address, so any return of an overpayment or wrong-network deposit is the merchant's action. Say so.
- Confirmations: show a count and target only from the real chain data and the configured threshold; no estimated time unless measured.
- Trust badges: only facts. "Non-custodial", link to the receiving address and contract on the explorer. No security certifications, no logos of third parties, no volume or uptime numbers.
- Support: only links and addresses that exist. If there is no support channel, show the payment ID and reference to give the merchant.
- Language switcher: only when translated strings exist. Currency switcher: omit.
- Receipt: values from the settled payment record only; label as a payment confirmation, not a tax document.
- Unknowns carried forward: exact payer-page visuals of NOWPayments, CCPayment, Cryptomus, Helio, Request Finance and Coinbase Business Checkouts were not seen in this session. Walk a live or sandbox invoice for each before finalising visual decisions.

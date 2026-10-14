# Crypto payment gateway marketing sites: benchmark for Plinth

Date: 2026-10-11. Method: text extraction of each homepage (WebFetch) plus web search where a page blocked automated fetching.

Limits, stated honestly:
- Motion, interaction level and visual quality were NOT observed first-hand (text extraction only; no rendered screenshots). Statements about visual language are inferred from structure and copy.
- Stripe (stablecoin pages 404), Request Finance (403) and Coinbase Commerce/Business (502/403) could not be fetched. Their notes come from search results or are marked unverified.
- Numbers below are the sites' own marketing claims, not verified facts.
- Nothing here is to be copied. Patterns only.

---

## 1. Per-company notes

### CCPayment - https://ccpayment.com
- Hero: "Maximize Your Global Margins with Next-Gen Crypto Payments", a 0.2% fee claim, CTAs "Accept Payments Now" and "View API Docs".
- Hero visual is a mock dashboard (balance, coin list, 24h webhook success/failure chart): real product UI, not abstract art.
- Badge row under the hero: EU licensed, chargeback-free, enterprise stability, high availability.
- Long page (about 16 sections). Pricing section compares a traditional gateway (2.9% + $0.30) with its own flat rate.
- Three-audience block: AI agents (SKILL.md), core developers (REST + SDKs in Java/PHP/Go), e-commerce merchants (WooCommerce/WordPress plugins).
- Shows a real sample webhook JSON payload on the homepage.
- Five industry cards (e-commerce/SaaS, gaming, entertainment, trading, creator economy).
- Wallet logo wall (about 70 wallets) but NO coin or chain logos on the homepage; assets appear as text in the mockup.
- Compliance: footer carries entity name, jurisdiction, FinCEN MSB registration; separate Terms, Privacy, AML pages; a security section (encryption, KYT, MFA).
- Social proof is volume-style stats and conference photos; no named customers.
- Footer: Products, Solutions, Resources, Legal, social links. Six-question FAQ.
- Takeaway: very complete inventory but claim-heavy and generic; fee comparison and webhook sample are the strong ideas.

### NOWPayments - https://nowpayments.io
- Hero: "Crypto payment gateway for effortless payments", 300+ coins claim, CTAs "Accept payments" and "Send crypto".
- Visuals: account screen, desktop/mobile mockups, an invoice example.
- Stats band (transactions per month, volume, partners), press/award badges, Trustpilot link.
- Use-case tiles by industry plus a long-tail list (SaaS, marketplaces, charity, payroll, travel).
- Integrations section is vague (no named plugins on the homepage).
- Pricing noted inline: 1% starting fee, loyalty discounts, network fees excluded.
- Security section: 2FA, role-based access, withdrawal whitelisting, AML.
- Seven wallet/exchange logos rather than coin logos. Cookie banner linking terms and privacy.
- Takeaway: marketing-heavy and stats-led; weakest on how the thing actually works.

### BitPay - https://www.bitpay.com
- Homepage is now consumer-app-led; business payments live in nav and footer.
- Hero: phone mockup, wallet count stat, rotating news cards announcing new chain support.
- Strongest part is the footer as information architecture: business products (online payments, stablecoin payments, billing, payouts, in-store, donations), pricing, savings calculator; a Developers column (integrations guide, open-source GitHub, PGP keys, status page); a Company column (Trust Center, legal, complaints, accessibility, supported assets, transaction information, conflict-of-interest disclosure).
- Compliance is textual: NMLS ID, New York DFS licence, entity disclaimers.
- Takeaway: institutional feel comes from disclosure depth, not visual flash.

### Circle - https://www.circle.com/usdc
- Hero: "The world's largest regulated stablecoin", CTAs "Partner with Circle" and "View docs". Photos plus UI alert cards (completed off-ramp, paid invoice).
- Five value-prop blocks (settlement, compliance, market expansion, programmable money, agents).
- Named case-study cards with logos; partner logos under three use-case blocks.
- Trust: reserve composition card with a date, monthly attestation by a Big Four firm, links to reserves page and policy hub, numbered legal footnotes for every claim.
- Chain display: "natively issued on 38 blockchains" followed by a logo grid of every network.
- Developer entry: "Build with USDC" card, developer console, docs, community.
- Nine-question FAQ with FAQPage structured data.
- Takeaway: best model for presenting USDC and chains plainly with sourced footnotes. Two live-number widgets rendered as empty placeholders when fetched: dynamic stats need a safe fallback.

### Stripe - stablecoin payments (not fetchable; search only, low confidence)
- Press coverage: USDC accepted on Ethereum, Solana, Polygon and Base; funds converted to USD; fee reported near 1.5% (third-party reports, unverified).
- Stripe's general site pattern (prior knowledge, not re-verified): code-first hero with a snippet beside UI, docs prominent. Treat as inferred.

### Request Finance - https://www.request.finance (403, not fetched)
- No first-hand data. Reputation-based positioning only (invoicing, payroll, expenses and accounting for crypto-paying companies). Unverified.

### Helio (hel.io) now MoonPay Commerce - https://www.moonpay.com/en-gb/business/commerce
- hel.io 307-redirects to MoonPay Commerce, a reminder that small gateway brands get acquired; an independent non-custodial gateway can differentiate on that.
- Hero: "The easiest way to accept crypto payments globally", CTAs "Explore Docs" and "Get Started".
- Four benefit blocks (no middlemen, lower fees, more customers, instant settlement with optional auto-convert).
- Five-slide feature carousel: deposits, checkout, pay links, pay with card, widgets/plug-ins. Builder block (no-code, headless API + webhooks, branded UX).
- Unlabeled logo strip, "6,000+ businesses" claim; no pricing and no chain list on the page.
- Footer carries FCA registration and a repeated risk warning.

### Cryptomus - https://cryptomus.com
- Hero: "The Ultimate All-in-One Crypto Ecosystem" (gateway + cards + trading + staking). Press logo strip and a CertiK badge.
- Gateway fee stated inline (0.4%). Unified API link to docs. Plugins only in the footer.
- Footer: privacy, terms, AML. No status page, no use-case section.
- Takeaway: scope sprawl dilutes the message; a focused product is a real advantage.

### Plisio - https://plisio.net
- Hero: "Accept Crypto on Your Website", "Fast. Convenient. Secure.", setup in about two minutes.
- Product screenshots (invoice, store creation).
- "Accept 15+ Supported Coins" as a logo grid, each coin linking to its own page.
- Integrations as a logo grid (WooCommerce, Magento, Shopware, Telegram) linking to GitHub.
- Real PHP code samples on the homepage (balance, payouts, create invoice) with a Documentation button.
- "Fair Pricing" block: single percentage, no monthly or setup fees.
- Closest to Plinth in shape (hero, assets, integrations, code, pricing in one scroll) and the most concrete of the lower-tier group.

### Bridge - https://www.bridge.xyz
- Short page: hero "Make money move", customer logo strip, four product cards, four solution cards, three benefit blocks, footer.
- Docs linked in header and footer. Region-specific regulatory disclosures in the footer (NMLS, CSSF).
- Minimal and confident; credibility via real customer names and disclosures. Customer logos do not apply to Plinth, but brevity with exact copy does.

### Utila - https://utila.io
- Hero: "Secure Stablecoin Infrastructure for Fintechs, Banks & Enterprises". Stats row (volume, companies, uptime).
- Six product cards, six feature tabs, nine capability blocks, an "Audited & Validated" block (SOC 2 Type II stated).
- Supported chains as numbers ("100+ blockchains", "30+ integrations") plus an FAQ list.
- Named customer stories and a testimonial.
- Footer has an "All systems operational" status link, API reference, help center, guides, trust center, security page, legal (terms, privacy, cookies).
- Takeaway: security evidence is a named, checkable standard, not adjectives.

---

## 2. Section matrix

Y = present on the fetched page, N = not seen, ~ = partial or footer-only, ? = could not fetch.

| Site | Hero visual | Assets grid with logos | Integrations | Pricing on page | Use cases | Security / compliance | Docs link | Status | Named customers |
|---|---|---|---|---|---|---|---|---|---|
| CCPayment | Y (dashboard mock) | N (wallet logos only) | Y (WooCommerce/WP, SDKs) | Y (fee compare) | Y (5 cards) | Y (section, badges, legal) | Y | N | N |
| NOWPayments | Y (mockups, invoice) | N (wallet logos only) | ~ (vague) | Y (inline) | Y (tiles) | Y (2FA, RBAC, AML) | ~ | N | N |
| BitPay | Y (phone app) | ~ (graphic) | ~ (dev guide) | ~ (nav/footer) | Y | Y (NMLS, DFS, Trust Center) | Y | Y (footer) | N |
| Circle | Y (photo + UI cards) | Y (38-chain logo grid) | N | N | Y | Y (reserves, attestations, footnotes) | Y | N | Y |
| Stripe | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| Request Finance | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| MoonPay Commerce (ex-Helio) | Y | N | Y (plug-ins) | N | ~ | Y (FCA footer) | Y | N | ~ (logo strip) |
| Cryptomus | ~ | ~ (staking cards) | ~ (footer) | Y (inline) | N | ~ (CertiK, AML) | Y | N | N |
| Plisio | Y (screenshots) | Y (coin logo grid) | Y (logo grid) | Y | Y | ~ (2FA, SSL) | Y (code samples) | N | N |
| Bridge | N (icons) | N | N | N | Y | ~ (footer disclosures) | Y | N | Y (logos) |
| Utila | ? | ~ (numbers) | Y | Y (nav) | Y | Y (SOC 2 Type II, trust center) | Y | Y (footer) | Y |

Observation: only Circle and Plisio show logos for assets or chains, both as a plain grid. Status links are rare (BitPay, Utila). Plinth already has a status page, which is a differentiator.

---

## 3. Twelve patterns that make these sites feel production-grade

1. Real product UI in the hero (dashboard, invoice, checkout), not abstract illustration.
2. A CTA pair that serves two audiences: "start" and "read the docs".
3. A sample webhook payload or code snippet visible on the homepage (CCPayment, Plisio).
4. Assets and chains shown as a labelled logo grid with an exact count, tiles linking to detail (Circle, Plisio).
5. An integrations grid with named platforms and links to repos or guides (Plisio, CCPayment).
6. Fee transparency: a plain number, what it excludes (network fees), often a before/after comparison.
7. Use-case sections by buyer type (store, SaaS, marketplace, payroll, donations).
8. Compliance expressed as checkable specifics: entity name, registration numbers, jurisdiction, named audit standard, dated attestations (BitPay, Circle, Utila).
9. Claims carry footnotes or sources (Circle numbers every disclosure).
10. A deep, organised footer: Products, Developers, Company, Legal, Status, Supported assets, Contact (BitPay is the model).
11. An FAQ that answers commercial objections (fees, chargebacks, settlement, supported assets, custody), ideally with FAQ structured data.
12. Legal baseline present and linked: Terms, Privacy, AML/compliance, cookie notice, risk warning.

Weak patterns seen (do not adopt): unverifiable volume or partner stats, generic stats bands, press-logo strips, award badges, conference photos, scope sprawl into cards/trading/staking, security adjectives with no evidence.

---

## 4. Content inventory for a production gateway site

Pages
- Home
- Product pages: checkout, payment links, invoices, invoice addresses and settlement, webhooks, API, dashboard
- Use-case pages: online store, SaaS and subscriptions, freelancers and agencies, marketplaces, donations
- Networks / supported assets (logos, per-network detail: confirmations, explorer, status)
- Pricing (what is and is not included, network fees, worked examples)
- Security (custody model, key handling, webhook signing, audit status, disclosure policy)
- Developers (quickstart, API reference link, webhook guide, SDK status, sandbox, changelog, OpenAPI)
- Docs site (separate)
- Status page with incident history
- About, contact, support
- Changelog or roadmap
- Blog or guides (only if maintained)

Home sections
- Hero with real product UI and two CTAs
- How it works in 3 to 4 steps (diagram of the actual money flow)
- Product surfaces (checkout, link, invoice, dashboard)
- Supported networks and token (logo grid, counts)
- Integrations (named, with true status: available, planned)
- Developer block (snippet, webhook payload, docs link)
- Pricing summary
- Security and custody summary
- Use cases
- FAQ
- Final CTA and deep footer

Supported assets and networks display
- Token logo, chain logos, chain name, testnet or mainnet badge, contract address, explorer link, confirmation policy, per-chain status.

Integration list (show true state per item)
- REST API, webhooks, SDKs (JS/TS, Python), WooCommerce, Shopify, WordPress, payment-link embed, hosted checkout, no-code (Zapier), accounting export (CSV), chat notifications

FAQ topics
- Custody (who holds keys and funds), settlement timing, fees and who pays network fees, supported chains and token, underpaid/overpaid/late payments, refunds, confirmations and finality, webhook retries and signatures, testnet vs mainnet, KYC/KYB, supported countries, tax and accounting records, behaviour if the service is down, audit status

Legal pages
- Terms of Service, Privacy Policy, Cookie policy, AML/compliance statement (even if the statement is "not a regulated service"), Acceptable use, Risk disclosure, Vulnerability disclosure policy, entity/imprint details

---

## 5. Honest gap list: Plinth vs the field

Plinth today: home, networks, security, pricing, status, developers, contact.

| Gap | Severity | Note |
|---|---|---|
| No token or chain logos anywhere | High | Circle and Plisio both show logo grids; cheapest credibility fix |
| No integrations section | High | Even if most items are "planned", a truthful list with status is standard |
| No legal pages (terms, privacy, cookies, risk) | High | Every benchmarked site has them; absence reads as unfinished |
| Docs are one page | High | Developers judge a gateway by docs depth: quickstart, webhook guide, API reference |
| No use-case pages | Medium | Competitors have at least a homepage section |
| No code or webhook sample on home | Medium | Cheap and strong (CCPayment, Plisio) |
| No product UI in the hero | Medium | Competitors show dashboard, invoice or checkout |
| No FAQ | Medium | All major sites carry one |
| Footer likely shallow | Medium | BitPay's footer is the benchmark |
| No customers, volume, licences, audits | Not a gap to fill | Must stay absent; say so plainly rather than imitate stats bands |

Plinth strengths: a status page exists (rare in this set); the non-custodial design is a real differentiator against custodial gateways that hold funds; the focused USDC-only scope avoids the sprawl seen at Cryptomus and NOWPayments.

---

## 6. Ten recommendations for Plinth (true to what it is)

1. Add token and chain logos from official brand kits (USDC plus each chain actually supported) in a grid on home and networks. Label every tile Testnet. Show the exact count of live chains, not a "100+" claim.
2. Put real product UI in the hero: the hosted checkout and a dashboard invoice view rendered from the actual app on testnet, with a visible "Testnet" tag.
3. Add a "how settlement works" diagram of the real flow: invoice address, payer sends USDC, funds settle to the merchant's own vault, signed webhook fires. Make non-custodial the central message and state what Plinth never holds.
4. Add an integrations section with honest status chips (Available, In progress, Planned): REST API, signed webhooks, payment links, hosted checkout available if true; WooCommerce, Shopify, SDKs shown only with their real status.
5. Show a real signed-webhook payload and a create-invoice request and response on home and developers, taken from the live API, including the signature header name and a verification snippet.
6. Grow developers into a docs structure: quickstart, authentication, invoices, payment links, webhooks and signature verification, retries, errors, testnet guidance, changelog; link an OpenAPI spec if one exists.
7. Add legal pages now: Terms, Privacy, Cookie notice, Acceptable use, and a plain risk disclosure stating testnet-only, unaudited, no guarantees. Add entity and contact details when they exist.
8. Make pricing concrete: the actual fee model, what network fees are, a worked example, and a note that nothing is charged while testnet-only (if true). Compare against card processing only with cited, current figures.
9. Turn candour into the trust signal: a "Status of the product" block (testnet only, unaudited, no production customers), an audit-status line and a vulnerability-disclosure contact on the security page. Do not use stats bands, partner logos, testimonials, awards or licence badges.
10. Add use-case pages that describe flows rather than customers (online store, invoicing, payment link for a freelancer, donations), an 8 to 10 question FAQ (custody, underpayment, finality, refunds, webhooks, mainnet timing), and a deep footer modelled on BitPay's structure: Product, Developers, Networks, Security, Status, Legal, Contact.

# Design brief — Plinth

**Product.** Non-custodial USDC payment infrastructure. Merchants accept USDC by connected wallet or by a unique
per-invoice address; a permission-restricted relayer settles into a vault the merchant alone controls.

**Personality.** Exacting. Calm. Ledger-like. Quietly confident. It should feel like the instrument a careful
finance team would trust, not a crypto landing page.

**Audience.** Finance/ops people reconciling payments, and developers integrating an API. Both need
numbers they can trust and states they can read at a glance.

**Reference / mood.** A printed bank ledger and an architectural drawing: warm paper, graphite ink, hairline rules,
tabular figures, annotations in the margin. Nothing glows.

**Signature idea — the Settlement Rail.** Every payment is drawn as one horizontal rail with five stations:
*Detected → Verified → Final → Swept → In vault*. Stations fill from real backend facts (block, confirmations,
transaction hash), never from a client click. It is the checkout's status display, the payment-detail timeline's
spine, and the explanatory diagram on the homepage. One memorable object, reused honestly.

## Decisions

| Area | Choice | Why |
| --- | --- | --- |
| Display type | Instrument Serif | Ledger-heading character; used only for large moments |
| UI type | Hanken Grotesk (variable) | Humanist grotesk with real weight range; not an AI-default face |
| Numeric / data | IBM Plex Mono | Addresses, hashes, amounts; tabular by nature |
| Accent | Oxide vermilion `#B8421F` | Unexpected for finance; used for primary action + the rail "live" marker only |
| Neutrals | Warm paper → graphite, tinted | No pure `#fff`/`#000` |
| Status colour | Verdigris (settled), ochre (pending), slate-blue (in flight), brick (failed) | Colour carries state, never decoration |
| Layout | Hairline rules and whitespace, asymmetry, one focal element per screen | Avoid boxes-in-boxes |
| Elevation | None on content; one shadow reserved for overlays | One elevation language |
| Radius | 4px controls, 8px panels | One radius language |
| Motion | 140–220 ms ease-out; state changes only; `prefers-reduced-motion` honoured | Motion explains, never decorates |
| Icons | Lucide, 1.5px stroke, one set | Uniform metrics |

## Honesty rules in the UI

* "Received" (final on-chain at the deposit address) and "Settled" (confirmed inside the vault) are separate numbers.
* A wallet button never says "gasless" unless the selected network + wallet path can actually relay.
* No fabricated logos, customers, audits, volume or uptime. Empty states say what to do next.
* Success is only ever shown from backend-verified status, never from a click or a redirect.

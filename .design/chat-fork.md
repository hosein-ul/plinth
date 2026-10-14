# Plinth Chat (fork) - design note

Mode: inherit. Same Daylight direction as Plinth (tokens, type, surfaces, motion character); only the composition,
copy, hero asset and information order differ. Source: apps/chat (a copy of apps/web with its own marketing home).

## What differs from the main site
- Audience: bot builders, Mini App developers, channel owners, small resellers. Not developers first.
- Hero asset: a phone running one 12 s chat story (offer, tap, checkout sheet, paid, delivery, seller notification), CSS only.
  It is our own chat UI (ink and white bubbles), not a copy of any messenger.
- Order: who it is for, how it works in four plain steps, three ways to start, networks, honest status, FAQ, closing call.
- Telegram mark: from the simple-icons package, used only to say where it can be used. Not used as our logo or name.
  Footer and FAQ state that Plinth is independent and not affiliated with or endorsed by Telegram.

## Rules
- No claim of a feature that is not built (Mini App theming, MCP, SDKs, TON are not built).
- Chat copy stays plain: no code on the home page. Code lives in /developers and /build-with-ai.

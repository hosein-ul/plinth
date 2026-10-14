# Paid-access chat bot (Plinth template)

A small bot that sells access for USDC through Plinth. `/buy` creates a payment and shows a **Pay** button; when Plinth sends the signed
`payment.confirmed` webhook, the bot messages the buyer and can send a one-time invite link to a private channel.

Test networks only. Use `sk_test_...` keys.

## What is tested, and what is not

- Tested (`pnpm test`, 8 tests): webhook signature check (tamper, wrong secret, stale timestamp, missing header), delivery only on
  `payment.confirmed`, replay protection, non-2xx on failure, ignoring payments from other sources, and that the secret key is only
  ever sent as a bearer header.
- **Not tested**: running against the real Telegram Bot API with a real bot token, and a live Plinth API. The Telegram calls
  (`/start`, `/buy`, sending messages, creating invite links) are thin and untested here. Run it with a test bot before relying on it.

## Run it

```bash
cp .env.example .env        # fill BOT_TOKEN (from @BotFather), PLINTH_API_URL, PLINTH_SECRET_KEY, PLINTH_WEBHOOK_SECRET
npm install
npx tsx --env-file=.env src/server.ts
```

In the Plinth dashboard add a webhook endpoint that points at `https://<your-public-url>/webhook` and copy its signing secret into
`PLINTH_WEBHOOK_SECRET`. Locally, use an HTTPS tunnel.

## Before real use

- Replace the in-memory `seen` set in `src/server.ts` with a database table, so a restart cannot cause a double delivery.
- Make `onPaid` idempotent (it is called at most once per event id here, but your delivery should still be safe to repeat).
- The bot token and the Plinth secret key live on the server only. Never put them in a client bundle or a Mini App.
- Telegram has its own rules for what can be sold inside Mini Apps. Read them for your case.

import { Bot, InlineKeyboard } from "grammy";
import { createPayment, type PlinthConfig } from "./plinth";
import { makeReference } from "./handler";

export interface BotConfig { token: string; plinth: PlinthConfig; priceUsdc: string; sku: string; title: string }

/** /buy shows the offer; the button opens a Plinth checkout made for this chat. The secret key never leaves the server. */
export function buildBot(cfg: BotConfig): Bot {
  const bot = new Bot(cfg.token);
  bot.command("start", (ctx) => ctx.reply(`${cfg.title}\nSend /buy to pay ${cfg.priceUsdc} USDC.`));
  bot.command("buy", async (ctx) => {
    const reference = makeReference(ctx.chat.id, cfg.sku);
    // One payment per chat and day: sending /buy twice returns the same payment, not a second one.
    const day = new Date().toISOString().slice(0, 10);
    const payment = await createPayment(cfg.plinth, { amount: cfg.priceUsdc, orderReference: reference, idempotencyKey: `${reference}:${day}` });
    await ctx.reply(`${cfg.title}\n${cfg.priceUsdc} USDC. Pick any network that has USDC.`, { reply_markup: new InlineKeyboard().url(`Pay ${cfg.priceUsdc} USDC`, payment.checkout_url) });
  });
  return bot;
}

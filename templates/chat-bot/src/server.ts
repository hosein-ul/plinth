import { createServer } from "node:http";
import { buildBot } from "./bot";
import { handleWebhook } from "./handler";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required (see .env.example)`);
  return v;
};

const bot = buildBot({
  token: env("BOT_TOKEN"),
  plinth: { apiUrl: env("PLINTH_API_URL"), secretKey: env("PLINTH_SECRET_KEY") },
  priceUsdc: process.env.PRICE_USDC ?? "25.00",
  sku: "access",
  title: "Studio membership",
});

// Replace with a real database: event ids must survive restarts or a replay would deliver twice.
const seen = new Set<string>();

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.statusCode = 404;
    return void res.end();
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    const status = await handleWebhook(Buffer.concat(chunks).toString("utf8"), req.headers["plinth-signature"] as string | undefined, {
      secret: env("PLINTH_WEBHOOK_SECRET"),
      firstSight: async (id) => !seen.has(id) && !!seen.add(id),
      onPaid: async ({ chatId }) => {
        await bot.api.sendMessage(chatId, "Payment received. You are in.");
        const chat = process.env.ACCESS_CHAT_ID;
        if (chat) {
          const link = await bot.api.createChatInviteLink(chat, { member_limit: 1 });
          await bot.api.sendMessage(chatId, `Your private invite link: ${link.invite_link}`);
        }
      },
    });
    res.statusCode = status;
  } catch (err) {
    console.error("webhook failed, Plinth will retry:", err);
    res.statusCode = 500;
  }
  res.end();
}).listen(Number(process.env.PORT ?? 8787));

bot.start();

import { siTelegram } from "simple-icons";

/**
 * The Telegram mark, taken from the simple-icons package (not drawn here). Telegram is a trademark of its owner; this site is
 * not affiliated with or endorsed by Telegram. The mark is used only to say where Plinth Chat can be used.
 */
export function TelegramMark({ size = 20, className, tone = "brand" }: { size?: number; className?: string; tone?: "brand" | "current" }) {
  return (
    <svg role="img" aria-label="Telegram" viewBox="0 0 24 24" width={size} height={size} className={className} fill={tone === "brand" ? `#${siTelegram.hex}` : "currentColor"}>
      <path d={siTelegram.path} />
    </svg>
  );
}

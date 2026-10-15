import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Plinth: get paid in USDC where your customers already chat", template: "%s · Plinth" },
  description: "A non-custodial USDC payment gateway for Mini Apps, shops and resellers selling in Telegram. Every order gets its own address and is charged automatically; the money lands in a vault only you can open.",
};

export const viewport: Viewport = { themeColor: "#f3f5f8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* General Sans (Fontshare) for everything; JetBrains Mono for addresses, hashes and code only. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-ctl focus:bg-ink focus:px-3 focus:py-2 focus:text-on-ink">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

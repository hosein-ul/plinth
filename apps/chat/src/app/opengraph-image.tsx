import { ImageResponse } from "next/og";

export const alt = "Plinth: get paid in USDC, straight to your own vault";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Font = { name: string; data: ArrayBuffer; weight: 500 | 600; style: "normal" };

/** General Sans from the Fontshare CDN (TTF, since Satori cannot read WOFF2). Any failure falls back to the default font. */
async function loadFonts(): Promise<Font[]> {
  try {
    const ctl = AbortSignal.timeout(6000);
    const css = await (await fetch("https://api.fontshare.com/v2/css?f[]=general-sans@500,600", { signal: ctl })).text();
    const faces = [...css.matchAll(/url\('([^']+\.ttf)'\)[^}]*?font-weight:\s*(\d+)/g)];
    const out: Font[] = [];
    for (const [, url = "", weight = "500"] of faces) {
      const res = await fetch(url.startsWith("//") ? `https:${url}` : url, { signal: ctl });
      if (!res.ok) continue;
      out.push({ name: "General Sans", data: await res.arrayBuffer(), weight: Number(weight) as 500 | 600, style: "normal" });
    }
    return out;
  } catch {
    return [];
  }
}

const steps = ["Detected", "Verified", "Final", "Swept", "In vault"];

export default async function OpengraphImage() {
  const fonts = await loadFonts();
  const family = fonts.length ? "General Sans" : "sans-serif";
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "64px 72px", fontFamily: family, color: "#0c1220",
          background: "radial-gradient(circle at 82% 12%, #ffffff 0, rgba(255,255,255,0) 55%), #f3f5f8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg width="48" height="48" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="9" fill="#0c1220" />
            <rect x="6" y="21" width="20" height="4" rx="1" fill="#ffffff" />
            <rect x="9" y="16" width="14" height="5" fill="#ffffff" fillOpacity="0.72" />
            <circle cx="16" cy="12" r="4" fill="#0ea66b" />
          </svg>
          <div style={{ marginLeft: 16, fontSize: 38, fontWeight: 600, letterSpacing: -1.3 }}>Plinth</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 76, fontWeight: 500, letterSpacing: -3.4, lineHeight: 1.02 }}>
            <span>Get paid in USDC.&nbsp;</span>
            <span style={{ color: "#8d97a8" }}>Straight to your own vault.</span>
          </div>
          <div style={{ marginTop: 24, fontSize: 28, fontWeight: 500, color: "#485366", lineHeight: 1.35, maxWidth: 900 }}>
            Non-custodial USDC payments. Every invoice gets an address that can only pay you.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            return (
              <div key={s} style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: last ? 0 : 12 }}>
                <div style={{ display: "flex", height: 8, borderRadius: 4, background: last ? "#0ea66b" : "#0c1220" }} />
                <div style={{ marginTop: 14, fontSize: 22, fontWeight: 500, color: last ? "#0a6f48" : "#485366" }}>{s}</div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}

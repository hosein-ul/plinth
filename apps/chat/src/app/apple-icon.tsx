import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The Plinth mark scaled to 180px on the ground colour (iOS applies its own corner mask). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, background: "#f3f5f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="140" height="140" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="9" fill="#0c1220" />
          <rect x="6" y="21" width="20" height="4" rx="1" fill="#ffffff" />
          <rect x="9" y="16" width="14" height="5" fill="#ffffff" fillOpacity="0.72" />
          <circle cx="16" cy="12" r="4" fill="#0ea66b" />
        </svg>
      </div>
    ),
    { ...size },
  );
}

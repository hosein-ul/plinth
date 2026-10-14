import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The Plinth mark (stepped pedestal carrying one mint value), same 32 grid as components/logo.tsx. */
export default function Icon() {
  return new ImageResponse(
    (
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="9" fill="#0c1220" />
        <rect x="6" y="21" width="20" height="4" rx="1" fill="#ffffff" />
        <rect x="9" y="16" width="14" height="5" fill="#ffffff" fillOpacity="0.72" />
        <circle cx="16" cy="12" r="4" fill="#0ea66b" />
      </svg>
    ),
    { ...size },
  );
}

import type { Metadata } from "next";
import { DemoFrame } from "./demo-frame";

/**
 * The public dashboard demo. No sign-in, no API calls, no cookies: every page renders the same view
 * components as /dashboard, fed by static sample data (see lib/demo-source.ts).
 */
export const metadata: Metadata = {
  title: { default: "Demo dashboard", template: "%s · Demo" },
  description: "A read-only tour of the Plinth dashboard with clearly labelled sample data.",
  robots: { index: false, follow: false, nocache: true },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoFrame>{children}</DemoFrame>;
}

"use client";
import { FitBox } from "@/components/marketing/fit-box";
import { CheckoutWindow } from "@/components/marketing/hero-visuals";
import { usePhonePhase } from "@/components/marketing/iphone-checkout";
import { ChatPhone } from "@/components/chat/chat-phone";

/**
 * Two channels, one engine: the hosted checkout in a desktop browser (a shop, a payment link, your own site) next to the same
 * payment inside a chat. Drawn in one 740 by 690 coordinate system and scaled to the column. Only used from the xl breakpoint;
 * below it the page shows the phone on its own.
 */
export function HeroScene() {
  const phase = usePhonePhase();
  return (
    <FitBox w={740} h={690} className="scene-anim select-none">
      <p className="absolute left-1 top-[118px] inline-flex h-7 items-center rounded-full border border-line bg-raised px-3 text-xs font-medium text-ink-2 shadow-low">Your site, a payment link or the API</p>
      <div className="absolute left-0 top-[160px]" style={{ animation: "scene-float 8s ease-in-out infinite alternate" }}><CheckoutWindow phase={phase} /></div>
      <div className="absolute left-[440px] top-0" style={{ animation: "scene-float 7s ease-in-out -2s infinite alternate" }}>
        <ChatPhone />
      </div>
    </FitBox>
  );
}

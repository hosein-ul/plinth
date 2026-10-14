"use client";
import { useId, useState } from "react";
import { CopyCode } from "@/components/marketing/pages/copy-code";
import { SCENARIOS } from "@/lib/ai-kit";
import { cn } from "@/lib/cn";

/** Pick what you are building; get a prompt you can paste into any AI coding assistant. */
export function AiKitPicker() {
  const [id, setId] = useState(SCENARIOS[0]!.id);
  const base = useId();
  const current = SCENARIOS.find((s) => s.id === id)!;
  return (
    <div>
      <div role="tablist" aria-label="What are you building?" className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            id={`${base}-${s.id}`}
            role="tab"
            type="button"
            aria-selected={s.id === id}
            aria-controls={`${base}-panel`}
            onClick={() => setId(s.id)}
            className={cn("h-11 rounded-full border px-4 text-[0.9375rem] font-medium transition-colors duration-[var(--duration-base)]", s.id === id ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-raised text-ink-2 hover:bg-wash hover:text-ink")}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${id}`} className="mt-5">
        <p className="mb-3 text-[0.9375rem] text-ink-2">{current.blurb}</p>
        <CopyCode label={`prompt · ${current.label.toLowerCase()}`} className="[&_pre]:max-h-[26rem] [&_pre]:whitespace-pre-wrap [&_pre]:overflow-y-auto">{current.prompt}</CopyCode>
      </div>
    </div>
  );
}

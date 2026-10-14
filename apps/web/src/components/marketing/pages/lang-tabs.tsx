"use client";
import { useId, useState } from "react";
import { CopyCode } from "@/components/marketing/pages/copy-code";
import { cn } from "@/lib/cn";

export interface LangSample { id: string; label: string; file: string; code: string }

/** One example in several languages. Each sample is a real file that our test script runs against the API. */
export function LangTabs({ samples, caption }: { samples: LangSample[]; caption?: string }) {
  const [id, setId] = useState(samples[0]!.id);
  const base = useId();
  const cur = samples.find((s) => s.id === id)!;
  return (
    <div className="min-w-0">
      <div role="tablist" aria-label="Language" className="mb-3 flex flex-wrap gap-1.5">
        {samples.map((s) => (
          <button
            key={s.id}
            id={`${base}-${s.id}`}
            role="tab"
            type="button"
            aria-selected={s.id === id}
            aria-controls={`${base}-panel`}
            onClick={() => setId(s.id)}
            className={cn("h-9 rounded-full border px-3.5 text-sm font-medium transition-colors duration-[var(--duration-base)]", s.id === id ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-raised text-ink-2 hover:bg-wash hover:text-ink")}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${id}`}>
        <CopyCode label={cur.file} className="[&_pre]:max-h-[30rem] [&_pre]:overflow-auto">{cur.code}</CopyCode>
      </div>
      {caption && <p className="mt-2.5 text-xs text-ink-3">{caption}</p>}
    </div>
  );
}

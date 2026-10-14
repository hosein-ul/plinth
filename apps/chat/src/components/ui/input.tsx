import * as React from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-ctl border border-line-strong bg-raised px-3 text-sm text-ink shadow-ctl placeholder:text-ink-4 transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:border-ink-4 focus-visible:border-signal focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/20 disabled:bg-sunk disabled:text-ink-3 disabled:shadow-none aria-[invalid=true]:border-bad aria-[invalid=true]:ring-[3px] aria-[invalid=true]:ring-bad/15";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...p} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-24 py-2.5", className)} {...p} />;
});

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...p} />;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({
  label, hint, error, htmlFor, children, className,
}: { label: string; hint?: React.ReactNode; error?: string | null; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-err`} role="alert" className="mt-1.5 text-sm text-bad-ink">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-sm text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

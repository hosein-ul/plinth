"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Search } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState, ErrorState, Skeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { notifyDemoReadOnly, useDataSource, useHref } from "@/lib/data-source";

/** First letter up, rest as given: "confirmed" -> "Confirmed". */
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** Link style used inside table cells: ink text with a quiet underline. */
export const cellLink =
  "text-sm text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:decoration-ink";

/** Mono reference to a payment, linking to its detail page. */
export function PaymentRef({ id }: { id?: string | null }) {
  const href = useHref();
  if (!id) return <span className="text-ink-4">—</span>;
  return (
    <Link
      href={href(`/dashboard/payments/${id}`)}
      title={id}
      className="font-mono text-xs text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:decoration-ink"
    >
      {id.slice(0, 14)}…
    </Link>
  );
}

/**
 * Link to the hosted checkout of a payment. In the demo there is no real checkout to open, so it shows
 * the sample-data notice instead of navigating.
 */
export function CheckoutLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const { readOnly } = useDataSource();
  if (readOnly) return <button type="button" onClick={notifyDemoReadOnly} className={className}>{children}</button>;
  return <a href={href} target="_blank" rel="noreferrer noopener" className={className}>{children}</a>;
}

/** A value in a mono, selectable field with a copy button. */
export function CopyField({ value, label, className, testId }: { value: string; label?: string; className?: string; testId?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-ctl border border-line-strong bg-wash py-1.5 pl-3 pr-1.5", className)}>
      <span className="min-w-0 flex-1 select-all break-all font-mono text-[0.8125rem] leading-5 text-ink" data-testid={testId}>{value}</span>
      <CopyButton value={value} label={label ?? "Copy"} className="shrink-0" />
    </div>
  );
}

/** The one-time reveal of a secret. Warning first, the value large and selectable, then a deliberate Done. */
export function SecretReveal({ title, value, note, doneLabel = "I have stored it" }: { title: string; value: string; note: string; doneLabel?: string }) {
  return (
    <div className="space-y-4" role="alert">
      <div className="flex items-start gap-3 rounded-ctl bg-warn-quiet px-3.5 py-3 text-sm text-warn-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p><span className="font-medium">Shown once.</span> {note}</p>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">{title}</p>
        <div className="rounded-ctl border border-line-strong bg-wash p-3.5">
          <p className="select-all break-all font-mono text-sm leading-6 text-ink" data-testid="secret-value">{value}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CopyButton value={value} label="Copy to clipboard" className="h-9 px-3" />
        <DialogClose asChild><Button variant="primary">{doneLabel}</Button></DialogClose>
      </div>
    </div>
  );
}

/** Confirmation dialog for destructive actions. The confirm button is the danger variant and names the outcome. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, loading, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description: React.ReactNode; confirmLabel: string; loading?: boolean; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="w-[min(92vw,28rem)]">
        <p className="text-sm text-ink-2">{description}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="danger" loading={loading} onClick={onConfirm} className="bg-bad text-on-ink hover:bg-bad hover:brightness-110 border-transparent">{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Styled checkbox that stays a real input underneath. Ink when checked; mint is reserved for confirmed states. */
export function CheckRow({ checked, onChange, children, mono, className }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <label className={cn("group flex cursor-pointer items-center gap-2.5 rounded-ctl px-2 py-1.5 text-sm text-ink transition-colors duration-[var(--duration-fast)] hover:bg-sunk", mono && "font-mono text-xs", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="grid size-[18px] shrink-0 place-items-center rounded-[6px] border border-line-strong bg-raised text-on-ink shadow-ctl transition-colors duration-[var(--duration-fast)] peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:ring-[3px] peer-focus-visible:ring-signal/30 [&>svg]:scale-50 [&>svg]:opacity-0 peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100 [&>svg]:transition-[opacity,transform] [&>svg]:duration-[var(--duration-fast)]">
        <Check className="size-3" strokeWidth={3} />
      </span>
      {children}
    </label>
  );
}

/** Row of labels-left, fields-right for settings. Stacks on mobile. */
export function FormGroup({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-10 gap-y-5 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div>
        <h2 className="t-3 text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
      </div>
      <div className="max-w-xl space-y-5">{children}</div>
    </div>
  );
}

/** Segmented filter plus search, sitting above a ledger table. */
export interface FilterOption { value: string; label: string; count: number }

function FilterBar({
  options, value, onChange, search, onSearch, placeholder, shown, total,
}: { options: FilterOption[]; value: string; onChange: (v: string) => void; search: string; onSearch: (v: string) => void; placeholder: string; shown: number; total: number }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      {options.length > 2 && (
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1 pt-0.5">
          <Tabs value={value} onValueChange={onChange}>
            <TabsList aria-label="Filter by status">
              {options.map((o) => (
                <TabsTrigger key={o.value} value={o.value}>
                  {o.label}<span className="tnum ml-1.5 text-xs text-ink-4">{o.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
      <div className="relative ml-auto w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
        <Input aria-label={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="h-9 pl-9" />
      </div>
      <p className="tnum w-full text-xs text-ink-3 sm:w-auto" role="status">{shown === total ? `${total} ${total === 1 ? "record" : "records"}` : `${shown} of ${total}`}</p>
    </div>
  );
}

function FilterBarSkeleton() {
  return (
    <div className="mb-3 flex items-center gap-3">
      <Skeleton className="h-10 w-72 rounded-[13px]" />
      <Skeleton className="ml-auto hidden h-9 w-64 rounded-ctl sm:block" />
    </div>
  );
}

export interface LedgerProps<T> {
  caption: string;
  rows: T[] | undefined;
  loading?: boolean;
  error?: unknown;
  retry?: () => void;
  rowKey: (r: T) => string;
  columns: Column<T>[];
  onRowClick?: (r: T) => void;
  empty: { title: string; body: React.ReactNode; action?: React.ReactNode };
  /** Optional client-side filtering over the rows already loaded. */
  filter?: { status: (r: T) => string; statusLabel?: (s: string) => string; text: (r: T) => string; placeholder: string };
}

/** A ledger: optional filter bar, a DataTable in a white card, and every state (loading, error with retry, empty, no match). */
export function Ledger<T>({ caption, rows, loading, error, retry, rowKey, columns, onRowClick, empty, filter }: LedgerProps<T>) {
  const [status, setStatus] = React.useState("ALL");
  const [query, setQuery] = React.useState("");

  const options = React.useMemo<FilterOption[]>(() => {
    if (!filter || !rows) return [];
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(filter.status(r), (counts.get(filter.status(r)) ?? 0) + 1);
    return [{ value: "ALL", label: "All", count: rows.length }, ...[...counts].map(([value, count]) => ({ value, label: filter.statusLabel ? filter.statusLabel(value) : cap(value), count }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const shown = React.useMemo(() => {
    if (!rows) return rows;
    if (!filter) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "ALL" || filter.status(r) === status) && (!q || filter.text(r).toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, status, query]);

  if (error && !rows) return <ErrorState error={error} retry={retry} />;

  const filtering = status !== "ALL" || query.trim() !== "";
  const emptyNode =
    rows && rows.length > 0 && filtering ? (
      <EmptyState
        title="Nothing matches"
        body="No record fits the current filter."
        action={<Button onClick={() => { setStatus("ALL"); setQuery(""); }}>Clear filter</Button>}
      />
    ) : (
      <EmptyState title={empty.title} body={empty.body} action={empty.action} />
    );

  return (
    <>
      {filter && (loading || !rows ? <FilterBarSkeleton /> : rows.length > 0 && (
        <FilterBar options={options} value={status} onChange={setStatus} search={query} onSearch={setQuery} placeholder={filter.placeholder} shown={shown?.length ?? 0} total={rows.length} />
      ))}
      <DataTable caption={caption} loading={loading} rows={shown} rowKey={rowKey} columns={columns} onRowClick={onRowClick} empty={emptyNode} />
    </>
  );
}

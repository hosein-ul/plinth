"use client";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useDataSource, useHref } from "@/lib/data-source";
import { relativeTime, STATUS_META } from "@/lib/format";
import { Amount } from "@/components/amount";
import { Progress5, StatusBadge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreatePaymentDialog, StartPaymentAction } from "./create-payment";
import { PaymentCell } from "./parts-payments";

const STATUS_GROUPS = [
  { value: "all", label: "All" },
  { value: "AWAITING_PAYMENT,DETECTED,CONFIRMING", label: "Open" },
  { value: "PAID,OVERPAID,SETTLEMENT_PENDING,SETTLED", label: "Paid" },
  { value: "SETTLEMENT_FAILED,INVALID_ASSET,UNDERPAID,LATE_PAYMENT", label: "Needs attention" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REFUND_REQUESTED,PARTIALLY_REFUNDED,REFUNDED", label: "Refunds" },
];

export function PaymentsView() {
  const router = useRouter();
  const href = useHref();
  const ds = useDataSource();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useInfiniteQuery({
    queryKey: [ds.cacheScope, "/v1/payments", debounced, status],
    initialPageParam: "" as string,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "25" });
      if (debounced) p.set("q", debounced);
      if (status !== "all") p.set("status", status);
      if (pageParam) p.set("cursor", pageParam);
      return ds.get<any>(`/v1/payments?${p}`);
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: ds.readOnly ? false : 8000,
  });
  const rows = query.data?.pages.flatMap((p) => p.data);

  return (
    <>
      <PageHeader title="Payments" description="Every payment intent, invoice and link payment, with verified on-chain status." actions={<CreatePaymentDialog />} />
      <div className="flex flex-col gap-3 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={status} onValueChange={setStatus} className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1 lg:pb-0">
          <TabsList aria-label="Filter by status" className="w-max">
            {STATUS_GROUPS.map((g) => <TabsTrigger key={g.value} value={g.value} className="whitespace-nowrap">{g.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search payments" placeholder="Search reference, ID, email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 pr-9" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-3 transition-colors duration-[var(--duration-fast)] hover:bg-sunk hover:text-ink">
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {query.error ? <ErrorState error={query.error} retry={() => query.refetch()} /> : (
      <DataTable
        caption="Payments" loading={query.isLoading} rows={rows} rowKey={(r: any) => r.id} onRowClick={(r: any) => router.push(href(`/dashboard/payments/${r.id}`))}
        empty={
          debounced || status !== "all"
            ? <EmptyState title="Nothing matches" body="Try a different search or clear the status filter." />
            : <EmptyState title="No payments yet" body="Create a payment to get a checkout page link and a unique deposit address per network. Payments created from your API appear here too." action={<StartPaymentAction />} />
        }
        columns={[
          { key: "ref", header: "Payment", cell: (r: any) => <PaymentCell title={r.order_reference ?? r.description ?? "—"} id={r.id} idLead={12} idTail={6} /> },
          { key: "status", header: "Status", cell: (r: any) => <span title={STATUS_META[r.status]?.hint}><StatusBadge status={r.status} /></span> },
          { key: "prog", header: "Progress", hideBelow: "md", cell: (r: any) => <Progress5 status={r.status} /> },
          { key: "net", header: "Networks", hideBelow: "lg", cell: (r: any) => <span className="text-ink-3">{r.networks.map((n: any) => n.name).join(", ")}</span> },
          { key: "recv", header: "Received", hideBelow: "lg", align: "right", cell: (r: any) => <Amount value={r.amount_received} size="sm" symbol={r.currency ?? "USDC"} unit={(r.currency ?? "USDC") !== "USDC"} className="text-ink-2" /> },
          { key: "when", header: "Created", hideBelow: "sm", cell: (r: any) => <span className="text-ink-3">{relativeTime(r.created_at)}</span> },
          { key: "amt", header: "Amount", align: "right", cell: (r: any) => <Amount value={r.amount} size="sm" symbol={r.currency ?? "USDC"} /> },
        ]}
      />
      )}
      {query.hasNextPage && (
        <div className="flex justify-center py-6"><Button variant="secondary" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>Load more</Button></div>
      )}
    </>
  );
}

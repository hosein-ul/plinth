"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DemoReadOnlyError, notifyDemoReadOnly, useDataSource } from "./data-source";

/** GET through the active data source: the real API (default) or, inside /demo, static sample data. */
export function useApi<T = any>(path: string | null, opts: { refetchMs?: number } = {}) {
  const ds = useDataSource();
  return useQuery<T>({
    queryKey: [ds.cacheScope, path],
    queryFn: () => ds.get<T>(path!),
    enabled: !!path,
    refetchInterval: ds.readOnly ? false : opts.refetchMs,
  });
}

/**
 * Mutation with toast feedback and cache invalidation of the listed path prefixes.
 * In the demo the mutation function is never called: the user gets the sample-data notice instead.
 */
export function useAction<TIn = any, TOut = any>(
  fn: (input: TIn) => Promise<TOut>,
  opts: { invalidate?: string[]; success?: string | ((out: TOut) => string); onSuccess?: (out: TOut) => void } = {},
) {
  const qc = useQueryClient();
  const ds = useDataSource();
  return useMutation<TOut, Error, TIn>({
    mutationFn: ds.readOnly ? async () => { throw new DemoReadOnlyError(); } : fn,
    onSuccess: (out) => {
      for (const p of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: [ds.cacheScope], predicate: (q) => String(q.queryKey[1]).startsWith(p) });
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(out) : opts.success);
      opts.onSuccess?.(out);
    },
    onError: (e) => (e instanceof DemoReadOnlyError ? notifyDemoReadOnly() : toast.error(e.message)),
  });
}

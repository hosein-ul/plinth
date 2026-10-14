"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true } } }));
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "!rounded-card !border !border-line !bg-raised !text-ink !shadow-float !font-sans",
            description: "!text-ink-3",
          },
        }}
      />
    </QueryClientProvider>
  );
}

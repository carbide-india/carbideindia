"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@ui5/webcomponents-react";

/**
 * App-wide client providers. The TanStack QueryClient lives here so any client
 * component (header search, etc.) can call useQuery — without this an app-wide
 * useQuery throws "No QueryClient set". Created once via useState so it isn't
 * recreated on every render.
 *
 * The SAP UI5 `ThemeProvider` supplies the Fiori runtime context (theme,
 * i18n, RTL, toast/portal roots) that every @ui5/webcomponents-react control
 * needs. It only affects UI5 components (they render into shadow DOM), so
 * legacy Tailwind pages are untouched during the migration to authentic Fiori.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

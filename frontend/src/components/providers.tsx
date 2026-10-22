"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { LocaleProvider, useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
export function Providers({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <LocaleProvider initialLocale={locale}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <QueryClientProvider client={client}>
          {children}
          <LocalizedToaster />
        </QueryClientProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
function LocalizedToaster() {
  const { t } = useI18n();
  return (
    <Toaster
      position="bottom-right"
      richColors
      containerAriaLabel={t("notifications.region")}
      toastOptions={{ closeButtonAriaLabel: t("common.close") }}
    />
  );
}

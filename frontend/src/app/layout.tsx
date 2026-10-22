import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { requestLocale } from "@/i18n/server";
import { messages } from "@/i18n/config";
import "./globals.css";
export async function generateMetadata(): Promise<Metadata> {
  return messages[await requestLocale()].metadata;
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await requestLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers locale={locale}>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}

"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
import { money, timestamp } from "@/lib/analytics";
import { describeError } from "./errors";
import {
  isLocale,
  localeCookie,
  messages,
  type Locale,
  type MessageKey,
} from "./config";

const LocaleContext = createContext<(locale: Locale) => void>(() => {});
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    updateLocale(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].metadata.title;
  }, [locale]);
  return (
    <LocaleContext.Provider value={setLocale}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages[locale]}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
export function useI18n() {
  const locale = useLocale();
  const t = useTranslations();
  const setLocale = useContext(LocaleContext);
  return useMemo(() => {
    const number = (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value);
    return {
      locale,
      setLocale,
      t,
      number,
      percent: (value: number, digits = 1) =>
        number(value / 100, {
          style: "percent",
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }),
      money: (value: number | null, currency: string) =>
        value === null
          ? t("common.notComparable")
          : money(value, currency, locale),
      date: (value: string) => timestamp(value, locale),
      error: (error: unknown) => {
        const message = describeError(error);
        return t(message.key, message.values);
      },
      issue: (code: string, part: "label" | "body" = "label") =>
        Object.hasOwn(messages[locale].issues, code)
          ? t(`issues.${code}.${part}` as MessageKey)
          : t(
              part === "label"
                ? "common.unknownIssue"
                : "common.unknownExplanation",
            ),
    };
  }, [locale, t, setLocale]);
}

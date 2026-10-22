import en from "../../messages/en-US.json";
import pt from "../../messages/pt-BR.json";

export const locales = ["en-US", "pt-BR"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en-US";
export const localeCookie = "clearledger-locale";
export type Messages = typeof en;
export const messages: Record<Locale, Messages> = { "en-US": en, "pt-BR": pt };
type LeafKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafKeys<T[K]>}`;
}[keyof T & string];
export type MessageKey = LeafKeys<Messages>;
export type MessageValues = Record<string, string | number | Date>;
export type Message = { key: MessageKey; values?: MessageValues };
export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
export function resolveLocale(
  preference: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isLocale(preference)) return preference;
  const candidates = (acceptLanguage ?? "")
    .split(",")
    .map((entry, index) => {
      const [tag, ...options] = entry.trim().split(";");
      const q = options.find((option) => option.trim().startsWith("q="));
      return {
        tag: tag.toLowerCase(),
        weight: q ? Number(q.trim().slice(2)) : 1,
        index,
      };
    })
    .filter((entry) => entry.weight > 0 && entry.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of candidates) {
    if (tag === "pt" || tag.startsWith("pt-")) return "pt-BR";
    if (tag === "en" || tag.startsWith("en-")) return "en-US";
  }
  return defaultLocale;
}
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

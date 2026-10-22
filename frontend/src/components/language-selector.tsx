"use client";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useI18n } from "@/i18n/provider";
import { locales, type Locale } from "@/i18n/config";
import { Button } from "./ui/button";
export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="language-trigger"
          aria-label={t("language.selector")}
          title={t("language.selector")}
        >
          <Globe2 size={16} />
          <span className="language-name">{t(`language.${locale}`)}</span>
          <span className="language-short" aria-hidden="true">
            {locale === "pt-BR" ? "PT" : "EN"}
          </span>
          <ChevronDown size={12} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="language-menu"
          align="end"
          sideOffset={8}
        >
          <DropdownMenu.Label className="language-menu-label">
            {t("language.preference")}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={locale}
            onValueChange={(value) => setLocale(value as Locale)}
          >
            {locales.map((value) => (
              <DropdownMenu.RadioItem
                key={value}
                className="language-option"
                value={value}
              >
                <span lang={value}>{t(`language.${value}`)}</span>
                <DropdownMenu.ItemIndicator>
                  <Check size={15} aria-label={t("language.active")} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

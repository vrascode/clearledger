"use client";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="panel empty-state">
      <h1>{t("fallback.notFound")}</h1>
      <p>{t("fallback.notFoundBody")}</p>
      <Button asChild>
        <Link href="/">{t("fallback.back")}</Link>
      </Button>
    </div>
  );
}

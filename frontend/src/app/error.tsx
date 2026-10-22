"use client";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="panel empty-state" role="alert">
      <h1>{t("fallback.interrupted")}</h1>
      <p>{t("fallback.interruptedBody")}</p>
      <Button onClick={reset}>{t("fallback.tryAgain")}</Button>
    </div>
  );
}

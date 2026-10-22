"use client";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CircleAlert,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { notify } from "@/i18n/notifications";
import { api, downloadReport } from "@/lib/api";
import { reportSchema } from "@/lib/contracts";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export function Status({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className={`status-pill ${value}`}>
      {value === "attention" ? <CircleAlert size={10} /> : <Check size={10} />}
      {value === "attention"
        ? t("status.attention")
        : value === "balanced"
          ? t("status.balanced")
          : t("status.matched")}
    </span>
  );
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{t("common.operations")}</div>
        <h1>{title}</h1>
        <p className="subtitle">{description}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function SampleBanner() {
  const { t } = useI18n();
  return (
    <div className="sample-banner">
      <div>
        <span className="banner-label">
          <FlaskConical size={14} />
          {t("common.sample")}
        </span>
        <span className="text-muted">{t("common.sampleDescription")}</span>
      </div>
      <Link
        href="/imports"
        className="text-link"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
        }}
      >
        {t("common.importYourData")}
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}
export function DemoButton({ disabled = false }: { disabled?: boolean }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async () =>
      reportSchema.parse(await api("demo", { method: "POST" })),
    onSuccess: async (report) => {
      await client.invalidateQueries({ queryKey: ["ledger"] });
      notify.success("notifications.sampleSuccess", undefined, {
        key: "notifications.sampleSummary",
        values: {
          exceptions: report.summary.exceptions,
          checks: report.summary.orders + report.summary.payouts,
        },
      });
      router.push(`/?run=${report.id}`);
    },
    onError: (error) => notify.error(error, "notifications.sampleFailure"),
  });
  return (
    <Button
      variant="outline"
      disabled={disabled || mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <LoaderCircle className="animate-spin" size={14} />
      ) : (
        <FlaskConical size={14} />
      )}
      {mutation.isPending
        ? t("common.runningSample")
        : t("common.exploreSample")}
    </Button>
  );
}
export function ExportButtons({ id }: { id: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function download(format: "csv" | "json") {
    setBusy(true);
    try {
      await downloadReport(id, format);
      notify.success("notifications.exported", {
        format: format.toUpperCase(),
      });
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="actions">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => download("csv")}
      >
        <ArrowDownToLine size={14} />
        {t("common.exportCsv")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => download("json")}
      >
        {t("common.json")}
      </Button>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="panel empty-state" role="alert">
      <div className="empty-icon">
        <CircleAlert size={25} />
      </div>
      <h2>{t("common.connectTitle")}</h2>
      <p>{message}</p>
      <div className="actions">
        {retry && (
          <Button variant="outline" onClick={retry}>
            <RefreshCw size={14} />
            {t("common.retry")}
          </Button>
        )}
        <Button asChild>
          <Link href="/settings">
            {t("settings.title")}
            <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
export function Loading() {
  const { t } = useI18n();
  return (
    <div aria-label={t("common.loading")} role="status">
      <div className="metrics">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl mb-5" />
      <Skeleton className="h-48 rounded-xl" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

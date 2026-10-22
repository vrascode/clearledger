"use client";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  LoaderCircle,
  Play,
} from "lucide-react";
import { notify } from "@/i18n/notifications";
import { api } from "@/lib/api";
import {
  kinds,
  reportSchema,
  runInputSchema,
  type ImportRecord,
  type Report,
  type Run,
} from "@/lib/contracts";

import { Button } from "./ui/button";
import { ExportButtons, Status } from "./common";

export function RunForm({ imports }: { imports: ImportRecord[] }) {
  const { t, number, error: formatError } = useI18n();
  const client = useQueryClient();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof runInputSchema>>({
    resolver: zodResolver(runInputSchema),
  });
  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof runInputSchema>) =>
      reportSchema.parse(
        await api("v1/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }),
      ),
    onSuccess: async (report) => {
      await client.invalidateQueries({ queryKey: ["ledger"] });
      notify.success("notifications.runSuccess", undefined, {
        key: "notifications.runSummary",
        values: { count: report.summary.exceptions },
      });
      router.push(`/runs?run=${report.id}`);
    },
    onError: (error) => notify.error(error, "notifications.runFailure"),
  });
  return (
    <div id="new-run" className="two-col">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{t("runs.start")}</h2>
            <p>{t("runs.selectWindow")}</p>
          </div>
        </div>
        <form
          className="form-body"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
        >
          {kinds.map((kind) => {
            const name = `${kind}_import_id` as const;
            return (
              <div key={kind}>
                <label className="field-label" htmlFor={name}>
                  {kind === "orders"
                    ? t("runs.ordersDataset")
                    : kind === "transactions"
                      ? t("runs.transactionsDataset")
                      : t("runs.depositsDataset")}
                </label>
                <select
                  className="w-full"
                  id={name}
                  {...register(name)}
                  aria-invalid={!!errors[name]}
                  disabled={mutation.isPending}
                >
                  <option value="">
                    {t("runs.selectDataset", { kind: t(`kind.${kind}`) })}
                  </option>
                  {imports
                    .filter((row) => row.kind === kind)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {t("runs.option", {
                          batch: row.batch_key,
                          count: row.row_count,
                          id: row.id.slice(0, 8),
                        })}
                      </option>
                    ))}
                </select>
                {errors[name] && (
                  <p className="form-error" role="alert">
                    {formatError(errors[name]?.message)}
                  </p>
                )}
              </div>
            );
          })}
          {mutation.error && (
            <p className="error-notice" role="alert">
              {formatError(mutation.error)}
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <Play size={14} />
            )}
            {mutation.isPending ? t("runs.running") : t("runs.run")}
          </Button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{t("runs.guideTitle")}</h2>
            <p>{t("runs.guideDescription")}</p>
          </div>
        </div>
        <div className="form-body">
          <div className="guide-list">
            {[
              [t("runs.guide1Title"), t("runs.guide1Body")],
              [t("runs.guide2Title"), t("runs.guide2Body")],
              [t("runs.guide3Title"), t("runs.guide3Body")],
            ].map(([title, copy], i) => (
              <div key={title} className="guide-item">
                <span>{number(i + 1)}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="notice">{t("runs.syncNote")}</div>
          <Link
            href="/imports"
            className="text-link text-xs inline-flex items-center gap-2"
          >
            {t("runs.needDataset")}
            <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </div>
  );
}
export function RunHistory({
  runs,
  compact = false,
}: {
  runs: Run[];
  compact?: boolean;
}) {
  const { t, number, date } = useI18n();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");
  const filtered = runs.filter((r) => status === "all" || r.status === status);
  const pages = Math.max(1, Math.ceil(filtered.length / 7));
  const current = Math.min(page, pages - 1);
  const rows = compact
    ? runs.slice(0, 4)
    : filtered.slice(current * 7, current * 7 + 7);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{compact ? t("runs.recent") : t("runs.history")}</h2>
          <p>{t("runs.historyDescription")}</p>
        </div>
        {compact ? (
          <Link
            href="/runs"
            className="text-link text-xs inline-flex items-center gap-1"
          >
            {t("runs.viewAll")}
            <ArrowRight size={12} />
          </Link>
        ) : (
          <select
            aria-label={t("runs.filterStatus")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">{t("runs.allStatuses")}</option>
            <option value="attention">{t("status.attention")}</option>
            <option value="balanced">{t("status.balanced")}</option>
          </select>
        )}
      </div>
      <div className="table-wrap">
        <table aria-label={t("runs.title")}>
          <thead>
            <tr>
              <th>{t("runs.id")}</th>
              <th>{t("runs.created")}</th>
              <th>{t("imports.records")}</th>
              <th>{t("runs.exceptions")}</th>
              <th>{t("table.status")}</th>
              <th>{t("runs.report")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => (
              <tr key={run.id}>
                <td>
                  <Link href={`/runs?run=${run.id}`} className="mono text-link">
                    {run.id.slice(0, 10)}
                  </Link>
                </td>
                <td className="text-muted">{date(run.created_at)}</td>
                <td className="numeric">
                  {number(run.summary.orders + run.summary.payouts)}
                </td>
                <td>
                  {run.summary.exceptions ? (
                    <span className="status-pill">
                      {t("common.exceptions", {
                        count: run.summary.exceptions,
                      })}
                    </span>
                  ) : (
                    <span className="text-muted">{t("common.none")}</span>
                  )}
                </td>
                <td>
                  <Status value={run.status} />
                </td>
                <td>
                  <Link
                    href={`/reconciliation?run=${run.id}`}
                    aria-label={t("runs.openReport", {
                      id: run.id.slice(0, 10),
                    })}
                    className="text-link inline-flex items-center gap-2 text-xs"
                  >
                    {t("runs.inspect")}
                    <ArrowRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={6}
                  className="text-muted text-center"
                  style={{ padding: 32 }}
                >
                  {t("runs.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!compact && (
        <div className="table-footer">
          <span>
            {t("common.runCount", { count: filtered.length })} ·{" "}
            {t("common.page", { page: current + 1, pages })}
          </span>
          <div className="actions">
            <Button
              aria-label={t("runs.previous")}
              size="icon"
              variant="outline"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              aria-label={t("runs.next")}
              size="icon"
              variant="outline"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
export function ReportSources({ report }: { report: Report }) {
  const { t, number, date } = useI18n();
  return (
    <section className="panel mt-5">
      <div className="panel-heading">
        <div>
          <h2>{t("runs.provenance")}</h2>
          <p>
            {t("runs.rules", { id: report.id, version: report.rules_version })}
          </p>
        </div>
        <Fingerprint size={19} className="text-muted" />
      </div>
      <div className="table-wrap">
        <table aria-label={t("runs.inputs")}>
          <thead>
            <tr>
              <th>{t("imports.dataset")}</th>
              <th>{t("imports.batchKey")}</th>
              <th>{t("runs.importId")}</th>
              <th>{t("imports.records")}</th>
              <th>SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((kind) => {
              const input = report.inputs[kind];
              return (
                <tr key={kind}>
                  <td>{t(`kind.${kind}`)}</td>
                  <td>{input.batch_key}</td>
                  <td className="mono">{input.id}</td>
                  <td>{number(input.row_count)}</td>
                  <td>
                    <details>
                      <summary className="mono cursor-pointer">
                        {input.sha256.slice(0, 12)}…
                      </summary>
                      <code className="mono">{input.sha256}</code>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>{t("common.created", { date: date(report.created_at) })}</span>
        <ExportButtons id={report.id} />
      </div>
    </section>
  );
}

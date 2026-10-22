"use client";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  FileCheck2,
  Layers3,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  api,
  getImports,
  getReport,
  getRuns,
  type ConnectionStatus,
} from "@/lib/api";
import { currencies, metrics } from "@/lib/analytics";
import type { Report } from "@/lib/contracts";
import { Button } from "./ui/button";
import {
  DemoButton,
  ErrorState,
  ExportButtons,
  Heading,
  Loading,
  SampleBanner,
  Status,
} from "./common";
import { MatchChart, MoneyChart, HistoryChart } from "./charts";
import { Imports } from "./imports";
import { RunForm, RunHistory, ReportSources } from "./runs";
import { Workspace } from "./workspace";
import { Settings } from "./settings";

type View =
  "overview" | "reconciliation" | "imports" | "runs" | "reports" | "settings";
export function Dashboard({ view }: { view: View }) {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardBody view={view} />
    </Suspense>
  );
}
function DashboardBody({ view }: { view: View }) {
  const { t, date, error: formatError } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [chosenCurrency, setCurrency] = useState("");
  const connection = useQuery({
    queryKey: ["connection"],
    queryFn: () => api<ConnectionStatus>("connection"),
  });
  const connected = connection.data?.connected === true;
  const runs = useQuery({
    queryKey: ["ledger", "runs"],
    queryFn: getRuns,
    enabled: connected,
  });
  const imports = useQuery({
    queryKey: ["ledger", "imports"],
    queryFn: getImports,
    enabled: connected,
  });
  const selectedId = params.get("run") ?? runs.data?.[0]?.id;
  const validId = !!selectedId && /^[a-f0-9]{32}$/.test(selectedId);
  const needsReport = view !== "imports" && view !== "settings";
  const selected = useQuery({
    queryKey: ["ledger", "report", selectedId],
    queryFn: () => getReport(selectedId!),
    enabled: connected && validId && needsReport,
  });
  if (view === "settings") return <Settings />;
  const report = selected.data;
  const availableCurrencies = report ? currencies(report) : [];
  const currency = availableCurrencies.includes(chosenCurrency)
    ? chosenCurrency
    : (availableCurrencies[0] ?? "BRL");
  const busy =
    connection.isPending ||
    (connected &&
      (runs.isPending ||
        imports.isPending ||
        (needsReport && validId && selected.isPending)));
  const error =
    connection.error ??
    runs.error ??
    imports.error ??
    (needsReport ? selected.error : null);
  return (
    <>
      <Heading
        title={t(`${view}.title`)}
        description={t(`${view}.description`)}
      >
        {view === "overview" || view === "imports" || view === "runs" ? (
          <DemoButton disabled={!connected} />
        ) : report ? (
          <ExportButtons id={report.id} />
        ) : null}
        {view !== "runs" && (
          <Button asChild>
            <Link href="/runs#new-run">
              <Plus size={14} />
              {t("common.newRun")}
            </Link>
          </Button>
        )}
      </Heading>
      {busy ? (
        <Loading />
      ) : error ? (
        <ErrorState
          message={formatError(error)}
          retry={() => {
            connection.refetch();
            runs.refetch();
            imports.refetch();
            if (validId) selected.refetch();
          }}
        />
      ) : !connected ? (
        <ErrorState
          message={
            connection.data?.message
              ? formatError(connection.data.message)
              : t("errors.connect")
          }
          retry={() => connection.refetch()}
        />
      ) : (
        <>
          {view === "imports" ? (
            <Imports imports={imports.data ?? []} />
          ) : (
            <>
              {report?.is_sample && <SampleBanner />}
              {view === "runs" && <RunForm imports={imports.data ?? []} />}
              {params.has("run") && !validId ? (
                <div className="error-notice" role="alert">
                  {t("dashboard.invalidRun")}
                  <Link href={pathname} className="underline">
                    {t("dashboard.openLatest")}
                  </Link>
                  .
                </div>
              ) : report ? (
                <>
                  <div className="toolbar">
                    <div className="actions">
                      <label
                        className="text-muted text-xs"
                        htmlFor="selected-run"
                      >
                        {t("dashboard.selectedRun")}
                      </label>
                      <select
                        id="selected-run"
                        value={selectedId}
                        onChange={(e) =>
                          router.push(`${pathname}?run=${e.target.value}`)
                        }
                      >
                        {!(runs.data ?? []).some(
                          (run) => run.id === selectedId,
                        ) && (
                          <option value={selectedId}>
                            {selectedId?.slice(0, 10)}
                          </option>
                        )}
                        {runs.data?.map((run) => (
                          <option key={run.id} value={run.id}>
                            {run.id.slice(0, 10)} · {date(run.created_at)}
                          </option>
                        ))}
                      </select>
                      <Status value={report.status} />
                    </div>
                    <div className="actions">
                      {(view === "overview" || view === "reports") && (
                        <>
                          <span className="text-muted text-xs">
                            {t("dashboard.displayCurrency")}
                          </span>
                          <select
                            aria-label={t("dashboard.displayCurrency")}
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                          >
                            {availableCurrencies.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={t("common.refresh")}
                        disabled={runs.isFetching || selected.isFetching}
                        onClick={() => {
                          runs.refetch();
                          imports.refetch();
                          selected.refetch();
                        }}
                      >
                        <RefreshCw size={14} />
                      </Button>
                    </div>
                  </div>
                  {view === "overview" && (
                    <>
                      <MetricCards report={report} currency={currency} />
                      <div className="chart-grid">
                        <MoneyChart report={report} currency={currency} />
                        <MatchChart report={report} currency={currency} />
                      </div>
                      <RunHistory runs={runs.data ?? []} compact />
                    </>
                  )}
                  {view === "reconciliation" && (
                    <>
                      <div className="notice mb-5 flex items-center justify-between gap-4">
                        <span>
                          <CircleAlert size={14} className="inline mr-2" />
                          <strong>
                            {t("dashboard.needsAttention", {
                              count: report.summary.exceptions,
                            })}
                          </strong>{" "}
                          {t("dashboard.recordScope", {
                            orders: report.summary.orders,
                            payouts: report.summary.payouts,
                          })}
                        </span>
                        <span className="text-xs">
                          {t("dashboard.allChecks")}
                        </span>
                      </div>
                      <Workspace key={report.id} report={report} />
                      <ReportSources report={report} />
                    </>
                  )}
                  {view === "runs" && (
                    <>
                      <div className="panel mb-5">
                        <div className="panel-heading">
                          <div>
                            <h2>{t("dashboard.completed")}</h2>
                            <p>
                              {t("dashboard.runSummary", {
                                checks:
                                  report.summary.orders +
                                  report.summary.payouts,
                                exceptions: report.summary.exceptions,
                                matched:
                                  report.summary.matched_orders +
                                  report.summary.matched_payouts,
                              })}
                            </p>
                          </div>
                          <Button variant="outline" asChild>
                            <Link href={`/reconciliation?run=${report.id}`}>
                              {t("dashboard.inspectReport")}
                              <ArrowRight size={14} />
                            </Link>
                          </Button>
                        </div>
                      </div>
                      <RunHistory runs={runs.data ?? []} />
                      <ReportSources report={report} />
                    </>
                  )}
                  {view === "reports" && (
                    <>
                      <MetricCards report={report} currency={currency} />
                      <div className="report-grid">
                        <MoneyChart report={report} currency={currency} />
                        <IssueBreakdown report={report} currency={currency} />
                      </div>
                      <div className="report-grid">
                        <HistoryChart runs={runs.data ?? []} />
                        <section className="panel">
                          <div className="panel-heading">
                            <div>
                              <h2>{t("reports.reading")}</h2>
                              <p>{t("reports.boundaries")}</p>
                            </div>
                            <FileCheck2 size={18} className="text-muted" />
                          </div>
                          <div className="form-body">
                            <dl className="definition-list">
                              <div>
                                <dt>{t("table.currency")}</dt>
                                <dd>{currency}</dd>
                              </div>
                              <div>
                                <dt>{t("metrics.expected")}</dt>
                                <dd>{t("reports.expectedDefinition")}</dd>
                              </div>
                              <div>
                                <dt>{t("metrics.processed")}</dt>
                                <dd>{t("reports.processedDefinition")}</dd>
                              </div>
                              <div>
                                <dt>{t("charts.net")}</dt>
                                <dd>{t("reports.netDefinition")}</dd>
                              </div>
                              <div>
                                <dt>{t("table.deposited")}</dt>
                                <dd>{t("reports.depositedDefinition")}</dd>
                              </div>
                            </dl>
                            <div className="notice">{t("reports.warning")}</div>
                            <ExportButtons id={report.id} />
                          </div>
                        </section>
                      </div>
                      <ReportSources report={report} />
                    </>
                  )}
                </>
              ) : view === "runs" ? (
                <RunHistory runs={runs.data ?? []} />
              ) : (
                <section className="panel">
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Layers3 size={24} />
                    </div>
                    <h2>{t("dashboard.emptyTitle")}</h2>
                    <p>{t("dashboard.emptyBody")}</p>
                    <div className="actions">
                      <DemoButton />
                      <Button asChild>
                        <Link href="/imports">
                          {t("dashboard.importDatasets")}
                          <ArrowRight size={14} />
                        </Link>
                      </Button>
                    </div>
                    <div className="mt-8 flex justify-center gap-5 text-muted text-xs">
                      <span>
                        <FileCheck2 className="inline mr-1" size={13} />
                        {t("dashboard.immutable")}
                      </span>
                      <span>
                        <ArrowLeftRight className="inline mr-1" size={13} />
                        {t("dashboard.currencyAware")}
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
function MetricCards({
  report,
  currency,
}: {
  report: Report;
  currency: string;
}) {
  const { t, money, number, percent } = useI18n();
  const data = metrics(report, currency);
  const cards = [
    {
      title: t("metrics.expected"),
      value: money(data.expected, currency),
      icon: Wallet,
      foot: t("metrics.expectedFoot"),
      marker: currency,
    },
    {
      title: t("metrics.processed"),
      value: money(data.processed, currency),
      icon: ArrowUpRight,
      foot: t("metrics.processedFoot"),
      marker: currency,
    },
    {
      title: t("metrics.deposited"),
      value: money(data.deposited, currency),
      icon: ArrowDownLeft,
      foot: t("metrics.depositedFoot"),
      marker: currency,
    },
    {
      title: t("metrics.exceptions"),
      value: number(data.exceptions, { minimumIntegerDigits: 2 }),
      icon: CircleAlert,
      foot: t("metrics.exceptionFoot", {
        count: data.total,
        rate: percent(data.matchRate),
      }),
      marker: data.exceptions ? t("metrics.review") : t("metrics.clear"),
    },
  ];
  return (
    <div className="metrics">
      {cards.map((card) => (
        <article className="panel metric-card" key={card.title}>
          <div className="metric-label">
            <span>{card.title}</span>
            <card.icon size={16} strokeWidth={1.5} />
          </div>
          <div className="metric-value">{card.value}</div>
          <div className="metric-foot">
            <span
              className={card.marker === t("metrics.review") ? "warn" : "good"}
            >
              {card.marker}
            </span>
            <span>· {card.foot}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
function IssueBreakdown({
  report,
  currency,
}: {
  report: Report;
  currency: string;
}) {
  const { t, issue: issueLabel, number } = useI18n();
  const data = metrics(report, currency);
  const counts: Record<string, number> = {};
  for (const row of [...data.orders, ...data.payouts])
    for (const issue of row.issues) counts[issue] = (counts[issue] ?? 0) + 1;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{t("reports.attention")}</h2>
          <p>
            {t("reports.findings", {
              findings: total,
              exceptions: data.exceptions,
              currency,
            })}
          </p>
        </div>
      </div>
      {Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([issue, count]) => (
          <div className="breakdown-item" key={issue}>
            <span>{issueLabel(issue)}</span>
            <strong>{number(count)}</strong>
            <div className="breakdown-track">
              <div
                className="breakdown-fill"
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      {!total && <div className="notice m-5">{t("reports.allMatched")}</div>}
      <div className="chart-foot">{t("reports.multipleFindings")}</div>
    </section>
  );
}

"use client";
import { useI18n } from "@/i18n/provider";
import { Fragment, useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownUp,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  currencies,
  orderHasCurrency,
  payoutHasCurrency,
} from "@/lib/analytics";
import type { OrderResult, PayoutResult, Report } from "@/lib/contracts";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Status } from "./common";

type RecordRow = {
  id: string;
  currencies: string[];
  expected: string;
  actual: string;
  delta: number | null;
  status: string;
  issues: string[];
  source: OrderResult | PayoutResult;
};
function joinedAmounts(
  values: Record<string, number>,
  { t, money }: ReturnType<typeof useI18n>,
) {
  return (
    Object.entries(values)
      .map(([currency, value]) => `${money(value, currency)} ${currency}`)
      .join(" / ") || t("common.noSource")
  );
}
function RecordDetails({ row }: { row: RecordRow }) {
  const { t, money, issue: issueLabel } = useI18n();
  const source = row.source;
  return (
    <div className="detail-grid">
      <div>
        {row.issues.length ? (
          row.issues.map((issue) => (
            <div key={issue} className="mb-3">
              <h3>{issueLabel(issue)}</h3>
              <p>{issueLabel(issue, "body")}</p>
            </div>
          ))
        ) : (
          <div>
            <h3>{t("detail.allMatched")}</h3>
            <p>{t("detail.agrees")}</p>
          </div>
        )}
      </div>
      <div>
        <h3>{t("detail.references")}</h3>
        <p>
          {t("detail.transactions", {
            ids: source.transaction_ids.join(", ") || t("common.none"),
          })}
        </p>
        {"deposit_ids" in source && (
          <p>
            {t("detail.deposits", {
              ids: source.deposit_ids.join(", ") || t("common.none"),
            })}
          </p>
        )}
        {"observed_currencies" in source && (
          <>
            <p>
              {t("detail.observedCurrencies", {
                currencies:
                  source.observed_currencies.join(", ") || t("common.none"),
              })}
            </p>
            <p>
              {t("detail.expectedRefund", {
                amount: source.currency
                  ? money(source.expected_refund_minor, source.currency)
                  : t("common.notComparable"),
              })}
            </p>
            <p>
              {t("detail.actualRefund", {
                amount: source.currency
                  ? money(source.actual_refund_minor, source.currency)
                  : t("common.notComparable"),
              })}
            </p>
          </>
        )}
        <p className="mt-3">{t("detail.immutable")}</p>
      </div>
    </div>
  );
}
export function Workspace({ report }: { report: Report }) {
  const i18n = useI18n();
  const { t, money, number, issue: issueLabel } = i18n;
  const [kind, setKind] = useState<"orders" | "payouts">("orders");
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("all");
  const [issue, setIssue] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [detailId, setDetail] = useState<string | null>(null);
  const data = useMemo(() => {
    const records: RecordRow[] =
      kind === "orders"
        ? report.orders
            .filter((o) => currency === "all" || orderHasCurrency(o, currency))
            .map((order) => ({
              id: order.order_id,
              currencies: [
                ...new Set([
                  ...(order.currency ? [order.currency] : []),
                  ...order.observed_currencies,
                ]),
              ],
              expected: order.currency
                ? money(order.expected_gross_minor, order.currency)
                : t("common.noOrder"),
              actual: order.currency
                ? money(order.actual_gross_minor, order.currency)
                : t("common.notComparable"),
              delta:
                order.actual_gross_minor !== null &&
                order.expected_gross_minor !== null
                  ? order.actual_gross_minor - order.expected_gross_minor
                  : null,
              status: order.status,
              issues: order.issues,
              source: order,
            }))
        : report.payouts
            .filter((p) => currency === "all" || payoutHasCurrency(p, currency))
            .map((payout) => ({
              id: payout.payout_id,
              currencies: [
                ...new Set([
                  ...Object.keys(payout.expected_net_by_currency),
                  ...Object.keys(payout.deposited_by_currency),
                ]),
              ],
              expected: joinedAmounts(payout.expected_net_by_currency, i18n),
              actual: joinedAmounts(payout.deposited_by_currency, i18n),
              delta: payout.delta_minor,
              status: payout.status,
              issues: payout.issues,
              source: payout,
            }));
    return records.filter(
      (row) =>
        row.id.toLowerCase().includes(search.toLowerCase()) &&
        (issue === "all" ||
          (issue === "attention"
            ? row.status === "attention"
            : row.issues.includes(issue))),
    );
  }, [report, kind, search, currency, issue, i18n, money, t]);
  const detail = data.find((row) => row.id === detailId) ?? null;
  const columns = useMemo<ColumnDef<RecordRow>[]>(
    () => [
      {
        id: "expand",
        header: "",
        cell: ({ row }) => (
          <Button
            size="icon"
            variant="ghost"
            aria-label={t(
              row.getIsExpanded() ? "table.collapse" : "table.expand",
              { id: row.original.id },
            )}
            aria-expanded={row.getIsExpanded()}
            onClick={row.getToggleExpandedHandler()}
          >
            {row.getIsExpanded() ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )}
          </Button>
        ),
      },
      {
        accessorKey: "id",
        header: kind === "orders" ? t("table.orderId") : t("table.payoutId"),
        cell: ({ row }) => (
          <button
            className="mono text-link"
            onClick={() => setDetail(row.original.id)}
          >
            {row.original.id}
          </button>
        ),
      },
      {
        id: "currency",
        accessorFn: (row) => row.currencies.join(", "),
        header: t("table.currency"),
      },
      {
        accessorKey: "expected",
        header:
          kind === "orders" ? t("table.expectedGross") : t("table.expectedNet"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="numeric">{row.original.expected}</span>
        ),
      },
      {
        accessorKey: "actual",
        header:
          kind === "orders" ? t("table.chargedGross") : t("table.deposited"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="numeric">{row.original.actual}</span>
        ),
      },
      {
        accessorKey: "status",
        header: t("table.status"),
        cell: ({ row }) => <Status value={row.original.status} />,
      },
      {
        id: "issues",
        header: t("table.finding"),
        accessorFn: (row) => row.issues.map((i) => issueLabel(i)).join(", "),
        cell: ({ row }) => (
          <span className="text-muted" style={{ fontSize: 11 }}>
            {row.original.issues.map((i) => issueLabel(i)).join(", ") ||
              t("table.allPassed")}
          </span>
        ),
      },
      {
        id: "details",
        header: "",
        cell: ({ row }) => (
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("table.inspect", { id: row.original.id })}
            onClick={() => setDetail(row.original.id)}
          >
            <ArrowRight size={13} />
          </Button>
        ),
      },
    ],
    [kind, t, issueLabel],
  );
  // TanStack exposes imperative table methods; this component is not React-Compiler memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 10 } },
  });
  function changeKind(value: "orders" | "payouts") {
    setKind(value);
    setIssue("all");
    setExpanded({});
    table.setPageIndex(0);
  }
  return (
    <>
      <div className="panel">
        <div
          className="tabs"
          role="tablist"
          aria-label={t("table.recordType")}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              const next = kind === "orders" ? "payouts" : "orders";
              changeKind(next);
              document.getElementById(`tab-${next}`)?.focus();
            }
          }}
        >
          {(["orders", "payouts"] as const).map((value) => (
            <button
              id={`tab-${value}`}
              role="tab"
              aria-selected={kind === value}
              aria-controls="record-panel"
              tabIndex={kind === value ? 0 : -1}
              key={value}
              className="tab"
              onClick={() => changeKind(value)}
            >
              {value === "orders" ? t("kind.orders") : t("kind.payouts")}
              <span className="tab-count">{number(report[value].length)}</span>
            </button>
          ))}
        </div>
        <div id="record-panel" role="tabpanel" aria-labelledby={`tab-${kind}`}>
          <div className="filters">
            <div className="search-field">
              <Search />
              <input
                className="field"
                aria-label={t("table.search")}
                placeholder={t(
                  kind === "orders"
                    ? "table.searchOrder"
                    : "table.searchPayout",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label={t("table.filterIssue")}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
            >
              <option value="all">{t("table.allResults")}</option>
              <option value="attention">{t("table.exceptionsOnly")}</option>
              {Object.keys(report.summary.issue_counts).map((i) => (
                <option key={i} value={i}>
                  {issueLabel(i)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("table.filterCurrency")}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="all">{t("table.allCurrencies")}</option>
              {currencies(report).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {(search || issue !== "all" || currency !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setIssue("all");
                  setCurrency("all");
                }}
              >
                {t("table.clearFilters")}
              </Button>
            )}
          </div>
          <div className="table-wrap">
            <table aria-label={t("table.records")}>
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : undefined
                        }
                      >
                        {header.column.getCanSort() ? (
                          <button
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            <ArrowDownUp size={10} />
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                    {row.getIsExpanded() && (
                      <tr className="detail-row">
                        <td colSpan={columns.length}>
                          <RecordDetails row={row.original} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!data.length && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="text-center text-muted"
                      style={{ padding: 40 }}
                    >
                      {t("table.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              {t(
                kind === "orders" ? "table.ordersCount" : "table.payoutsCount",
                { count: data.length },
              )}{" "}
              ·{" "}
              {t("common.page", {
                page: table.getState().pagination.pageIndex + 1,
                pages: Math.max(1, table.getPageCount()),
              })}
            </span>
            <div className="actions">
              <select
                aria-label={t("table.rowsPerPage")}
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {t("table.rows", { count: size })}
                  </option>
                ))}
              </select>
              <Button
                aria-label={t("table.previous")}
                size="icon"
                variant="outline"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                aria-label={t("table.next")}
                size="icon"
                variant="outline"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("detail.title", { id: detail?.id ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("detail.description")}</DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              <Status value={detail.status} />
              <dl className="definition-list">
                <div>
                  <dt>{t("detail.currencies")}</dt>
                  <dd>{detail.currencies.join(", ")}</dd>
                </div>
                <div>
                  <dt>
                    {kind === "orders"
                      ? t("table.expectedGross")
                      : t("table.expectedNet")}
                  </dt>
                  <dd>{detail.expected}</dd>
                </div>
                <div>
                  <dt>
                    {kind === "orders"
                      ? t("table.chargedGross")
                      : t("table.deposited")}
                  </dt>
                  <dd>{detail.actual}</dd>
                </div>
                <div>
                  <dt>{t("detail.delta")}</dt>
                  <dd>
                    {detail.delta !== null && detail.currencies.length === 1
                      ? `${money(detail.delta, detail.currencies[0])} ${detail.currencies[0]}`
                      : t("detail.incomparable")}
                  </dd>
                </div>
              </dl>
              <hr />
              <RecordDetails row={detail} />
              <div className="notice">
                {t("common.reportRules", {
                  id: report.id,
                  version: report.rules_version,
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

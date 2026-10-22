"use client";
import { useI18n } from "@/i18n/provider";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { metrics } from "@/lib/analytics";
import type { Report, Run } from "@/lib/contracts";

export function MoneyChart({
  report,
  currency,
}: {
  report: Report;
  currency: string;
}) {
  const { t, money, number } = useI18n();
  const data = metrics(report, currency);
  const values = [
    { name: t("charts.expected"), value: data.expected },
    { name: t("charts.processed"), value: data.processed },
    { name: t("charts.net"), value: data.net },
    { name: t("table.deposited"), value: data.deposited },
  ];
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>{t("charts.flowTitle")}</h2>
          <p>{t("charts.flowScope", { currency })}</p>
        </div>
        <span className="status-pill matched">{t("charts.sourceBacked")}</span>
      </div>
      <div
        className="chart-frame"
        role="img"
        aria-label={values
          .map((v) => `${v.name}: ${money(v.value, currency)}`)
          .join(". ")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={values}
            barSize={48}
            margin={{ top: 12, left: 0, right: 6, bottom: 2 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              dy={7}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={57}
              tickFormatter={(v) =>
                number(Number(v) / (currency === "JPY" ? 1 : 100))
              }
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="chart-tooltip">
                    <div className="text-muted">{payload[0].payload.name}</div>
                    <strong>{money(Number(payload[0].value), currency)}</strong>
                  </div>
                ) : null
              }
            />
            <Bar
              dataKey="value"
              radius={[5, 5, 0, 0]}
              isAnimationActive={false}
            >
              {values.map((v, i) => (
                <Cell
                  key={v.name}
                  fill={
                    [
                      "var(--chart-2)",
                      "var(--chart-1)",
                      "var(--chart-2)",
                      "var(--chart-3)",
                    ][i]
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-foot">
        <span>{t("charts.refundNote")}</span>
        <span>{t("charts.fees", { amount: money(data.fees, currency) })}</span>
      </div>
    </div>
  );
}
export function MatchChart({
  report,
  currency,
}: {
  report: Report;
  currency: string;
}) {
  const { t, number, percent } = useI18n();
  const data = metrics(report, currency);
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>{t("charts.health")}</h2>
          <p>{t("charts.healthScope", { currency })}</p>
        </div>
      </div>
      <div
        className="ring-wrap"
        role="img"
        aria-label={t("charts.healthAria", {
          matched: data.matched,
          total: data.total,
          exceptions: data.exceptions,
        })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[
                { name: t("status.matched"), value: data.matched },
                { name: t("status.attention"), value: data.exceptions },
              ]}
              dataKey="value"
              innerRadius={63}
              outerRadius={78}
              paddingAngle={data.matched && data.exceptions ? 3 : 0}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill="var(--chart-1)" />
              <Cell fill="var(--border)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="ring-label">
          <strong>{percent(data.matchRate)}</strong>
          <span>{t("charts.matchedLabel")}</span>
        </div>
      </div>
      <div className="status-rows">
        <div className="status-row">
          <span>
            <i className="dot" style={{ background: "var(--chart-1)" }} />
            {t("status.matched")}
          </span>
          <strong>{number(data.matched)}</strong>
        </div>
        <div className="status-row">
          <span>
            <i className="dot" style={{ background: "var(--input)" }} />
            {t("status.attention")}
          </span>
          <strong>{number(data.exceptions)}</strong>
        </div>
      </div>
      <div className="chart-foot">
        <span>{t("charts.checksCompleted")}</span>
        <strong style={{ color: "var(--success)" }}>
          {t("charts.completion", {
            rate: percent(100, 0),
            done: data.total,
            total: data.total,
          })}
        </strong>
      </div>
    </div>
  );
}
export function HistoryChart({ runs }: { runs: Run[] }) {
  const { t, percent } = useI18n();
  const recent = runs
    .slice(0, 8)
    .reverse()
    .map((run) => ({
      name: run.id.slice(0, 6),
      rate:
        ((run.summary.matched_orders + run.summary.matched_payouts) /
          (run.summary.orders + run.summary.payouts)) *
        100,
    }));
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>{t("charts.comparison")}</h2>
          <p>{t("charts.comparisonScope", { count: recent.length })}</p>
        </div>
      </div>
      <div
        className="chart-frame"
        role="img"
        aria-label={recent
          .map((r) =>
            t("charts.comparisonAria", { id: r.name, rate: percent(r.rate) }),
          )
          .join(". ")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={recent}
            barSize={40}
            margin={{ top: 10, left: 0, right: 10, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => percent(Number(v), 0)}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              formatter={(v) => [percent(Number(v)), t("charts.matchedLabel")]}
              contentStyle={{
                background: "var(--popover)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="rate"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-foot">{t("charts.comparisonNote")}</div>
    </div>
  );
}

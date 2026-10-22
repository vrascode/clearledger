import type { OrderResult, PayoutResult, Report } from "./contracts";

export function money(
  minor: number | null,
  currency: string,
  locale = "en-US",
) {
  if (minor === null) return "Not comparable";
  const digits = currency === "JPY" ? 0 : 2;
  if (!Number.isSafeInteger(minor)) throw new RangeError("errors.precision");
  const magnitude = BigInt(Math.abs(minor));
  const divisor = 10n ** BigInt(digits);
  const whole = magnitude / divisor;
  const signed = minor < 0 ? (whole === 0n ? -0 : -whole) : whole;
  // Format integer parts with BigInt so even large minor-unit values retain every cent.
  const fraction = (magnitude % divisor).toString().padStart(digits, "0");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .formatToParts(signed)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
export function timestamp(value: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
export function currencies(report: Report) {
  return [
    ...new Set([
      ...Object.keys(report.totals_by_currency),
      ...report.orders.flatMap((o) => [
        ...(o.currency ? [o.currency] : []),
        ...o.observed_currencies,
      ]),
    ]),
  ].sort();
}
export function orderHasCurrency(order: OrderResult, currency: string) {
  return (
    order.currency === currency || order.observed_currencies.includes(currency)
  );
}
export function payoutHasCurrency(payout: PayoutResult, currency: string) {
  return (
    currency in payout.expected_net_by_currency ||
    currency in payout.deposited_by_currency
  );
}
export function metrics(report: Report, currency: string) {
  const orders = report.orders.filter((o) => orderHasCurrency(o, currency));
  const payouts = report.payouts.filter((p) => payoutHasCurrency(p, currency));
  // Expected obligations are assigned only to their order currency, never an observed mismatched currency.
  const expected = report.orders
    .filter((o) => o.currency === currency)
    .reduce(
      (sum, o) =>
        sum + (o.expected_gross_minor ?? 0) - (o.expected_refund_minor ?? 0),
      0,
    );
  const totals = report.totals_by_currency[currency];
  const rows = [...orders, ...payouts];
  const matched = rows.filter((row) => row.status === "matched").length;
  return {
    expected,
    processed: (totals?.charged_minor ?? 0) - (totals?.refunded_minor ?? 0),
    deposited: totals?.deposited_minor ?? 0,
    fees: totals?.fee_minor ?? 0,
    net: totals?.net_minor ?? 0,
    matched,
    total: rows.length,
    exceptions: rows.length - matched,
    matchRate: rows.length ? (matched / rows.length) * 100 : 0,
    orders,
    payouts,
  };
}

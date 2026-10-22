import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currencies, metrics, money } from "@/lib/analytics";
import { reportSchema } from "@/lib/contracts";

const root = path.resolve("..");
const directory = path.join(
  root,
  ".tmp",
  `analytics-${process.pid}-${Date.now()}`,
);
mkdirSync(directory, { recursive: true });
const python =
  process.env.CLEARLEDGER_PYTHON ??
  path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
// Exercise the real Python report contract; no fabricated API response fixtures.
const report = reportSchema.parse(
  JSON.parse(
    execFileSync(
      python,
      [
        "-m",
        "clearledger",
        "--db",
        path.join(directory, "contract.sqlite3"),
        "demo",
      ],
      { cwd: root, encoding: "utf8" },
    ),
  ),
);

describe("financial presentation of real backend reports", () => {
  it("keeps expected, processed and deposited amounts separate by currency", () => {
    expect(metrics(report, "BRL")).toMatchObject({
      expected: 36500,
      processed: 29900,
      deposited: 24250,
      fees: 897,
      net: 29003,
      exceptions: 4,
      matched: 3,
      total: 7,
    });
    expect(metrics(report, "USD")).toMatchObject({
      expected: 12000,
      processed: 12000,
      deposited: 11500,
      fees: 360,
      net: 11640,
      exceptions: 1,
      matched: 1,
      total: 2,
    });
    // The missing-source order is observed in BRL and is included as an exception.
    expect(report.summary.exceptions).toBe(5);
  });
  it("formats JPY as zero-decimal minor units and signed differences correctly", () => {
    expect(money(10000, "JPY")).toBe("¥10,000");
    expect(money(-140, "USD")).toBe("-$1.40");
    expect(money(10000, "BRL")).toBe("R$100.00");
    expect(money(null, "USD")).toBe("Not comparable");
  });
  it("does not invent an expected payment for an unrecognized order", () => {
    const unknown = report.orders.find(
      (row) => row.order_id === "ORD-UNKNOWN",
    )!;
    expect(unknown.expected_gross_minor).toBeNull();
    expect(unknown.actual_gross_minor).toBeNull();
    expect(metrics(report, "BRL").expected).toBe(36500);
  });
  it("includes a missing-payment currency even if no transactions or deposits use it", () => {
    const copy = structuredClone(report);
    copy.orders.push({
      order_id: "JPY-MISSING",
      currency: "JPY",
      observed_currencies: [],
      expected_gross_minor: 10000,
      expected_refund_minor: 0,
      actual_gross_minor: 0,
      actual_refund_minor: 0,
      transaction_ids: [],
      status: "attention",
      issues: ["missing_payment"],
    });
    expect(currencies(copy)).toContain("JPY");
    expect(metrics(copy, "JPY")).toMatchObject({
      expected: 10000,
      processed: 0,
      deposited: 0,
      exceptions: 1,
      matchRate: 0,
    });
  });
  it("does not assign expected obligations to an observed mismatched currency", () => {
    const copy = structuredClone(report);
    copy.orders[0].observed_currencies.push("EUR");
    expect(metrics(copy, "EUR").expected).toBe(0);
    expect(currencies(copy)).toContain("EUR");
  });
  it("rejects amounts that could lose integer precision in JavaScript", () => {
    const copy = structuredClone(report);
    copy.totals_by_currency.BRL.charged_minor = Number.MAX_SAFE_INTEGER + 1;
    expect(() => reportSchema.parse(copy)).toThrow();
  });
});

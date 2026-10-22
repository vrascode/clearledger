import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const origin = process.env.CLEARLEDGER_TEST_URL ?? "http://127.0.0.1:13000";
const screenshots = path.resolve("../.runtime/screenshots");
async function sample(request: APIRequestContext) {
  const result = await request.post("/api/demo", { headers: { origin } });
  expect(result.ok()).toBeTruthy();
  return result.json();
}
async function capture(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(screenshots, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      description: v.description,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}

test("demo imports real CSVs, reconciles, switches currency, investigates and exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText("Clarity starts with your first reconciliation."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore sample data" }).first(),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Explore sample data" })
    .first()
    .click();
  await expect(page.locator(".sample-banner")).toContainText("Sample Data");
  await expect(page.locator(".metric-value").first()).toHaveText("R$365.00");
  await expect(page.locator(".metric-value").nth(3)).toHaveText("04");
  await expect(page.getByText("42.9%", { exact: true })).toBeVisible();
  await accessible(page);
  await capture(page, "01-overview");
  await page.getByLabel("Display currency").selectOption("USD");
  await expect(page.locator(".metric-value").first()).toHaveText("$120.00");
  await expect(page.locator(".metric-value").nth(3)).toHaveText("01");
  const id = new URL(page.url()).searchParams.get("run")!;
  const reportResponse = await page.request.get(`/api/v1/runs/${id}`);
  const report = await reportResponse.json();
  expect(report.summary).toMatchObject({
    exceptions: 5,
    orders: 6,
    payouts: 3,
  });
  expect(report.is_sample).toBe(true);
  await page.goto(`/reconciliation?run=${id}`);
  await expect(
    page.getByRole("table", { name: "Reconciliation records" }),
  ).toBeVisible();
  await accessible(page);
  await capture(page, "02-reconciliation");
  await page.getByRole("button", { name: "Expand ORD-1003" }).click();
  await expect(
    page.getByText("No charge in the expected currency was found.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect ORD-1003" }).click();
  await expect(page.getByRole("dialog")).toContainText("Missing payment");
  await accessible(page);
  await capture(page, "03-exception-details");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Filter discrepancy").selectOption("attention");
  await expect(page.getByText("3 orders · Page 1 of 1")).toBeVisible();
  await page.getByLabel("Search order or payout ID").fill("does-not-exist");
  await expect(
    page.getByText("No records match these filters.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("tab", { name: "Payouts" }).click();
  await expect(
    page.getByRole("table", { name: "Reconciliation records" }),
  ).toContainText("PAY-USD-01");
  await page.getByLabel("Filter currency").selectOption("USD");
  await expect(page.getByText("1 payout · Page 1 of 1")).toBeVisible();
  await page.getByRole("button", { name: "Inspect PAY-USD-01" }).click();
  await expect(page.getByRole("dialog")).toContainText("-$1.40 USD");
  await page.keyboard.press("Escape");
  const downloadWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).first().click();
  const downloaded = await downloadWait;
  const csv = await readFile((await downloaded.path())!, "utf8");
  expect(csv).toContain("ORD-1003");
  expect(csv).toContain("missing_payment");
  await page.goto(`/reports?run=${id}`);
  await expect(page.getByText("What needs attention")).toBeVisible();
  await accessible(page);
  await capture(page, "05-reports");
  await page.goto(`/?run=${id}`);
  await expect(page.locator(".metric-value").first()).toBeVisible();
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await accessible(page);
  await capture(page, "06-dark-mode");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(errors).toEqual([]);
});

test("CSV upload validates files, persists imports and reports idempotency conflicts", async ({
  page,
}) => {
  await page.goto("/imports");
  await expect(
    page.getByRole("button", { name: "Validate & import" }),
  ).toBeVisible();
  await accessible(page);
  await capture(page, "04-data-imports");
  await page
    .locator("#csv-file")
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("wrong,header\nx,y\n"),
    });
  await page.getByLabel("Batch key").fill("browser-orders-v1");
  await page.getByRole("button", { name: "Validate & import" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Expected CSV header" }),
  ).toBeVisible();
  const file = await readFile(path.resolve("../examples/orders.csv"));
  await page
    .locator("#csv-file")
    .setInputFiles({ name: "orders.csv", mimeType: "text/csv", buffer: file });
  await page.getByRole("button", { name: "Validate & import" }).click();
  await expect(page.getByText("Dataset ready · 5 records")).toBeVisible();
  const before = await (
    await page.request.get("/api/v1/imports?limit=100")
  ).json();
  await page.getByRole("button", { name: "Validate & import" }).click();
  await expect(page.getByText("Dataset ready · 5 records")).toBeVisible();
  const after = await (
    await page.request.get("/api/v1/imports?limit=100")
  ).json();
  expect(after.items.length).toBe(before.items.length);
  await page
    .locator("#csv-file")
    .setInputFiles({
      name: "orders.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(file.toString().replace("10000", "10100")),
    });
  await page.getByRole("button", { name: "Validate & import" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "different content" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("table", { name: "Import history" }),
  ).toContainText("browser-orders-v1");
  await page
    .locator("#csv-file")
    .setInputFiles({
      name: "large.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
  await expect(
    page.getByText("CSV files must be 2 MiB or smaller."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Validate & import" }),
  ).toBeDisabled();
});

test("manual dataset selection creates the same immutable run on replay", async ({
  page,
}) => {
  const report = await sample(page.request);
  await page.goto("/runs");
  await expect(
    page.getByRole("button", { name: "Run reconciliation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Run reconciliation", exact: true })
    .click();
  await expect(page.getByText("Select an orders dataset")).toBeVisible();
  for (const kind of ["orders", "transactions", "deposits"])
    await page
      .locator(`#${kind}_import_id`)
      .selectOption(report.inputs[kind].id);
  await page
    .getByRole("button", { name: "Run reconciliation", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`run=${report.id}`));
  await expect(page.getByText("Selected run completed")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("table", { name: "Report input datasets" }),
  ).toContainText(report.inputs.orders.id);
  const runs = await (await page.request.get("/api/v1/runs")).json();
  expect(
    runs.items.filter((r: { id: string }) => r.id === report.id),
  ).toHaveLength(1);
  await accessible(page);
});

test("table pagination and sorting operate on a real imported dataset", async ({
  page,
}) => {
  const ids: Record<string, string> = {};
  const data = {
    orders:
      "order_id,currency,expected_gross_minor,expected_refund_minor\n" +
      Array.from(
        { length: 12 },
        (_, i) => `TEST-${String(i + 1).padStart(2, "0")},JPY,10000,0\n`,
      ).join(""),
    transactions:
      "transaction_id,order_id,payout_id,currency,kind,gross_minor,fee_minor\n",
    deposits: "deposit_id,payout_id,currency,amount_minor\n",
  };
  for (const [kind, csv] of Object.entries(data)) {
    const result = await page.request.post(
      `/api/v1/imports/${kind}?batch_key=pagination-v1`,
      { headers: { origin, "Content-Type": "text/csv" }, data: csv },
    );
    expect(result.status()).toBe(201);
    ids[`${kind}_import_id`] = (await result.json()).id;
  }
  const result = await page.request.post("/api/v1/runs", {
    headers: { origin },
    data: ids,
  });
  expect(result.status()).toBe(201);
  const report = await result.json();
  expect(report.is_sample).toBe(false);
  await page.goto(`/reconciliation?run=${report.id}`);
  await expect(page.getByText("12 orders · Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next records page" }).click();
  await expect(page.getByText("12 orders · Page 2 of 2")).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Reconciliation records" }),
  ).toContainText("TEST-12");
  await page.getByLabel("Rows per page").selectOption("25");
  await expect(
    page.getByRole("button", { name: "Next records page" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Order ID" }).click();
  await page.getByRole("button", { name: "Order ID" }).click();
  await expect(
    page
      .getByRole("table", { name: "Reconciliation records" })
      .locator("tbody tr")
      .first(),
  ).toContainText("TEST-12");
  await page.goto(`/?run=${report.id}`);
  await expect(page.locator(".metric-value").first()).toHaveText("¥120,000");
  await expect(page.locator(".sample-banner")).toHaveCount(0);
});

test("connection UI handles invalid keys, rejects external URLs and verifies a session", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByText("API connected and database ready"),
  ).toBeVisible();
  await page.getByLabel("Local API address").fill("http://127.0.0.1:18000");
  await page
    .getByLabel("API key", { exact: true })
    .fill("invalid-key-that-is-long-enough-for-validation");
  await page.getByRole("button", { name: "Verify & connect" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "API authentication failed" }),
  ).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.getByLabel("Local API address").fill("http://example.com");
  await page
    .getByLabel("API key", { exact: true })
    .fill("invalid-key-that-is-long-enough-for-validation");
  await page.getByRole("button", { name: "Verify & connect" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "loopback port" }),
  ).toBeVisible();
  await page.getByLabel("Local API address").fill("http://127.0.0.1:18000");
  await page
    .getByLabel("API key", { exact: true })
    .fill(process.env.CLEARLEDGER_API_KEY!);
  await page.getByRole("button", { name: "Verify & connect" }).click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "clearledger-connection")!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Strict");
  expect(session.value === process.env.CLEARLEDGER_API_KEY).toBe(false);
  expect(
    (await page.evaluate(() => JSON.stringify(localStorage))).includes(
      process.env.CLEARLEDGER_API_KEY!,
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Reset session to environment configuration" })
    .click();
  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        (c) => c.name === "clearledger-connection",
      ),
    )
    .toBe(false);
  await accessible(page);
});

test("BFF preserves authentication and rejects CSRF, oversized CSVs and unsafe paths", async ({
  request,
}) => {
  expect((await request.get("http://127.0.0.1:18000/v1/runs")).status()).toBe(
    401,
  );
  expect(
    (
      await request.post("/api/demo", {
        headers: { origin: "https://evil.test" },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/demo")).status()).toBe(403);
  expect((await request.get("/api/openapi.json")).status()).toBe(404);
  expect(
    (await request.get("/api/v1/runs?redirect=http://example.com")).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/v1/imports/orders?batch_key=large", {
        headers: { origin, "Content-Type": "text/csv" },
        data: Buffer.alloc(2 * 1024 * 1024 + 1),
      })
    ).status(),
  ).toBe(413);
  const status = await request.get("/api/connection");
  expect((await status.text()).includes(process.env.CLEARLEDGER_API_KEY!)).toBe(
    false,
  );
  expect(status.headers()["cache-control"]).toBe("no-store");
});

test("mobile and tablet layouts preserve navigation and contain table overflow", async ({
  page,
}) => {
  const report = await sample(page.request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?run=${report.id}`);
  await expect(page.locator(".metric-value").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Reconciliation", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("table", { name: "Reconciliation records" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await accessible(page);
  await capture(page, "07-mobile");
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`/reports?run=${report.id}`);
  await expect(page.getByText("What needs attention")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await capture(page, "08-tablet");
});

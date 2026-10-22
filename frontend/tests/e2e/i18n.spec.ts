import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const origin = process.env.CLEARLEDGER_TEST_URL ?? "http://127.0.0.1:13000";
const headingPairs = [
  ["/", "Your books, in focus.", "Suas contas, com clareza."],
  ["/reconciliation", "Reconciliation workspace", "Área de conciliação"],
  ["/imports", "Bring your data together", "Reúna seus dados"],
  ["/runs", "Reconciliation runs", "Execuções de conciliação"],
  ["/reports", "Reports & analytics", "Relatórios e análises"],
  ["/settings", "Settings & connection", "Configurações e conexão"],
] as const;
async function switchTo(
  page: Page,
  language: "English (US)" | "Português (Brasil)",
) {
  await page.locator(".language-trigger").click();
  await page.getByRole("menuitemradio", { name: language }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "lang",
    language === "English (US)" ? "en-US" : "pt-BR",
  );
}
async function seed(page: Page) {
  const result = await page.request.post("/api/demo", { headers: { origin } });
  expect(result.ok()).toBe(true);
  return result.json();
}

test("all six pages switch instantly in both languages without refetching or losing form state", async ({
  page,
}) => {
  const report = await seed(page);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  for (const [route, english, portuguese] of headingPairs) {
    await page.goto(`${route}?run=${report.id}`);
    await expect(
      page.getByRole("heading", { name: english, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("API connected", { exact: true }),
    ).toBeVisible();
    const marker = await page.evaluate(() => {
      const value = Math.random();
      (
        window as typeof window & { localeTestMarker?: number }
      ).localeTestMarker = value;
      return value;
    });
    if (route === "/imports")
      await page.getByLabel("Batch key").fill("keep-this-batch");
    if (route === "/reconciliation")
      await page.getByLabel("Search order or payout ID").fill("ORD-1003");
    const network: string[] = [];
    const listener = (request: import("@playwright/test").Request) => {
      if (request.url().includes("/api/v1/")) network.push(request.url());
    };
    page.on("request", listener);
    await switchTo(page, "Português (Brasil)");
    await expect(
      page.getByRole("heading", { name: portuguese, exact: true }),
    ).toBeVisible();
    if (route === "/imports")
      await expect(page.getByLabel("Chave do lote")).toHaveValue(
        "keep-this-batch",
      );
    if (route === "/reconciliation") {
      await expect(
        page.getByLabel("Buscar ID do pedido ou repasse"),
      ).toHaveValue("ORD-1003");
      await expect(
        page.getByRole("table", { name: "Registros de conciliação" }),
      ).toContainText("Pagamento ausente");
    }
    if (route === "/" || route === "/reports")
      await expect(page.locator(".metric-value").first()).toHaveText(
        /R\$\s365,00/,
      );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await switchTo(page, "English (US)");
    await expect(
      page.getByRole("heading", { name: english, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { localeTestMarker?: number })
            .localeTestMarker,
      ),
    ).toBe(marker);
    page.off("request", listener);
    expect(network).toEqual([]);
  }
  expect(failures).toEqual([]);
});

test("preference persists after navigation, reload and reopening; keyboard selector exposes active language", async ({
  page,
  browser,
}) => {
  const report = await seed(page);
  await page.goto(`/?run=${report.id}`);
  await expect(page.locator(".metric-value").first()).toBeVisible();
  const trigger = page.getByRole("button", { name: "Change language" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitemradio", { name: "English (US)" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("menuitemradio", { name: "English (US)" }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitemradio", { name: "Português (Brasil)" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(
    page.getByRole("heading", { name: "Suas contas, com clareza." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Relatórios e análises", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Relatórios e análises", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  const state = await page.context().storageState();
  const reopened = await browser.newContext({
    storageState: state,
    locale: "en-US",
  });
  const tab = await reopened.newPage();
  await tab.goto(origin);
  await expect(
    tab.getByRole("heading", { name: "Suas contas, com clareza." }),
  ).toBeVisible();
  await expect(tab.locator("html")).toHaveAttribute("lang", "pt-BR");
  expect(
    (await reopened.cookies()).find(
      (cookie) => cookie.name === "clearledger-locale",
    )?.expires,
  ).toBeGreaterThan(Date.now() / 1000 + 30 * 24 * 3600);
  await reopened.close();
});

test("browser detection is rendered on the server and unsupported languages fall back to English", async ({
  browser,
  request,
}) => {
  for (const [browserLocale, expectedLocale, heading] of [
    ["pt-BR", "pt-BR", "Suas contas, com clareza."],
    ["fr-FR", "en-US", "Your books, in focus."],
  ] as const) {
    const context = await browser.newContext({ locale: browserLocale });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const response = await page.goto(origin);
    expect(await response!.text()).toContain(`lang="${expectedLocale}"`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", expectedLocale);
    expect(errors).toEqual([]);
    await context.close();
  }
  const invalid = await request.get("/", {
    headers: {
      cookie: "clearledger-locale=unknown",
      "accept-language": "pt-BR",
    },
  });
  expect(await invalid.text()).toContain('lang="pt-BR"');
});

test("active backend errors, validation and notifications change language without changing API records", async ({
  page,
}) => {
  const report = await seed(page);
  const before = await (
    await page.request.get(`/api/v1/runs/${report.id}`)
  ).json();
  await page.goto("/imports");
  await expect(
    page.getByRole("button", { name: "Validate & import" }),
  ).toBeVisible();
  await page
    .locator("#csv-file")
    .setInputFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "order_id,currency,expected_gross_minor,expected_refund_minor\nSYNTHETIC,BRL,invalid,0\n",
      ),
    });
  await page.getByLabel("Batch key").fill("i18n-failure-v1");
  await page.getByRole("button", { name: "Validate & import" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "expected_gross_minor must be a bounded integer" }),
  ).toBeVisible();
  await switchTo(page, "Português (Brasil)");
  await expect(
    page
      .getByRole("alert")
      .filter({
        hasText:
          "Registro 2: expected_gross_minor deve ser um inteiro dentro dos limites",
      }),
  ).toBeVisible();
  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Não foi possível concluir a importação" }),
  ).toBeVisible();
  await page.getByLabel("Chave do lote").fill("bad/key");
  await page.getByRole("button", { name: "Validar e importar" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use de 1 a 80" }),
  ).toBeVisible();
  await switchTo(page, "English (US)");
  await expect(
    page.getByRole("alert").filter({ hasText: "Use 1–80" }),
  ).toBeVisible();
  const after = await (
    await page.request.get(`/api/v1/runs/${report.id}`)
  ).json();
  expect(after).toEqual(before);
  const exported = await page.request.get(
    `/api/v1/runs/${report.id}/export?format=json`,
  );
  expect((await exported.json()).id).toBe(report.id);
});

test("Portuguese dialogs, empty filters, light/dark mobile and tablet layouts", async ({
  page,
}) => {
  const report = await seed(page);
  await page.goto(`/reconciliation?run=${report.id}`);
  await switchTo(page, "Português (Brasil)");
  await page
    .getByRole("button", { name: "Analisar ORD-1003", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Pagamento ausente");
  await expect(page.getByRole("dialog")).toContainText(
    "Nenhuma cobrança na moeda esperada",
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("Buscar ID do pedido ou repasse").fill("NONE");
  await expect(
    page.getByText("Nenhum registro corresponde aos filtros.", {
      exact: false,
    }),
  ).toBeVisible();
  await mkdir(path.resolve("../.runtime/screenshots"), { recursive: true });
  for (const [width, height, name] of [
    [390, 844, "pt-mobile"],
    [820, 1180, "pt-tablet"],
    [1440, 1050, "pt-overview"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/?run=${report.id}`);
    await expect(page.locator(".metric-value").first()).toHaveText(
      /R\$\s365,00/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: path.resolve(`../.runtime/screenshots/${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Alternar tema de cores" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: path.resolve("../.runtime/screenshots/pt-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/not-a-page");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});

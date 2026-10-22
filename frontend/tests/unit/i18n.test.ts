import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import {
  locales,
  messages,
  resolveLocale,
  type MessageKey,
  type MessageValues,
} from "@/i18n/config";
import { describeError, MessageError } from "@/i18n/errors";
import { money, timestamp } from "@/lib/analytics";
import { batchSchema, connectionSchema, runInputSchema } from "@/lib/contracts";

function flatten(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const name = prefix ? `${prefix}.${key}` : key;
      return typeof entry === "string"
        ? [[name, entry]]
        : Object.entries(flatten(entry, name));
    }),
  );
}
function variables(
  ast: MessageFormatElement[],
  result: Record<string, string> = {},
) {
  for (const element of ast) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    result[element.value] = [TYPE.number, TYPE.plural].includes(element.type)
      ? "number"
      : "string";
    if (element.type === TYPE.plural || element.type === TYPE.select)
      for (const option of Object.values(element.options))
        variables(option.value, result);
    if (element.type === TYPE.tag) variables(element.children, result);
  }
  return result;
}
describe("complete typed message catalogs", () => {
  const english = flatten(messages["en-US"]);
  const portuguese = flatten(messages["pt-BR"]);
  it("has matching nonempty keys and ICU parameters in both languages", () => {
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(english)) {
      expect(portuguese[key].trim(), key).not.toBe("");
      expect(variables(parse(portuguese[key])), key).toEqual(
        variables(parse(value)),
      );
    }
  });
  it.each(locales)(
    "formats every message without missing keys or ICU errors: %s",
    (locale) => {
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages: messages[locale],
        onError: (error) => errors.push(error.message),
      });
      for (const [key, value] of Object.entries(english)) {
        const args: MessageValues = Object.fromEntries(
          Object.entries(variables(parse(value))).map(([name, kind]) => [
            name,
            kind === "number" ? 2 : "example",
          ]),
        );
        expect(t(key as MessageKey, args), key).not.toBe(key);
      }
      expect(errors).toEqual([]);
    },
  );
  it("applies locale-specific plural rules", () => {
    const en = createTranslator({
      locale: "en-US",
      messages: messages["en-US"],
    });
    const pt = createTranslator({
      locale: "pt-BR",
      messages: messages["pt-BR"],
    });
    expect(en("common.records", { count: 1 })).toBe("1 record");
    expect(en("common.records", { count: 2 })).toBe("2 records");
    expect(pt("common.records", { count: 1 })).toBe("1 registro");
    expect(pt("common.records", { count: 2 })).toBe("2 registros");
  });
});
describe("locale negotiation and exact financial localization", () => {
  it.each([
    [undefined, "pt-BR,pt;q=0.9,en-US;q=0.8", "pt-BR"],
    [undefined, "en-GB", "en-US"],
    [undefined, "pt-PT", "pt-BR"],
    [undefined, "fr-FR", "en-US"],
    [undefined, null, "en-US"],
    ["en-US", "pt-BR", "en-US"],
    ["pt-BR", "en-US", "pt-BR"],
    ["invalid", "pt-BR", "pt-BR"],
    [undefined, "pt-BR;q=0,en-US;q=1", "en-US"],
    [undefined, "en-US;q=0.2,pt-BR;q=0.9", "pt-BR"],
  ])(
    "negotiates preference %s and browser %s",
    (preference, browser, expected) => {
      expect(resolveLocale(preference, browser)).toBe(expected);
    },
  );
  it("formats BRL, USD, JPY and negative sub-unit values without conversion", () => {
    expect(money(125050, "BRL", "en-US")).toBe("R$1,250.50");
    expect(money(125050, "BRL", "pt-BR")).toBe("R$\u00a01.250,50");
    expect(money(125050, "USD", "pt-BR")).toBe("US$\u00a01.250,50");
    expect(money(10000, "JPY", "en-US")).toBe("¥10,000");
    expect(money(10000, "JPY", "pt-BR")).toContain("10.000");
    expect(money(-1, "USD", "en-US")).toBe("-$0.01");
    expect(money(-1, "BRL", "pt-BR")).toBe("-R$\u00a00,01");
  });
  it("retains the last cent near JavaScript's safe integer limit", () => {
    expect(money(Number.MAX_SAFE_INTEGER, "USD", "en-US")).toBe(
      "$90,071,992,547,409.91",
    );
    expect(money(Number.MAX_SAFE_INTEGER, "BRL", "pt-BR")).toBe(
      "R$\u00a090.071.992.547.409,91",
    );
  });
  it("uses locale-specific dates with an explicit, deterministic UTC time zone", () => {
    const iso = "2026-10-21T14:30:00Z";
    expect(timestamp(iso, "en-US")).toContain("Oct");
    expect(timestamp(iso, "pt-BR")).toContain("out.");
    expect(timestamp(iso, "pt-BR")).toContain("14:30");
    expect(timestamp(iso, "en-US")).toContain("UTC");
  });
});
describe("backend explanations and validation remain locale-independent data", () => {
  it.each([
    ["Batch key already exists with different content", "errors.conflict"],
    [
      "API authentication failed. Update the key in Settings & connection.",
      "errors.authentication",
    ],
    ["Cannot reconcile three empty imports", "errors.empty"],
    ["Record 7: duplicate source identifier", "errors.duplicate"],
    ["Record 8: gross_minor must be a bounded integer", "errors.integer"],
    [
      "Record 2: order_id must be 1-80 ASCII letters, digits, _, ., : or -; start alphanumeric",
      "errors.recordIdentifier",
    ],
    ["CSV header must be exactly: order_id,currency", "errors.header"],
    ["CSV exceeds 10000 records", "errors.rows"],
    ["orders import not found", "errors.notFound"],
    ["Selected orders import has the wrong kind", "errors.wrongKind"],
  ])("maps existing diagnostic: %s", (message, key) => {
    expect(describeError(new Error(message)).key).toBe(key);
  });
  it("translates explanations while preserving technical identifiers", () => {
    const message = describeError(
      "Record 8: gross_minor must be a bounded integer",
    );
    const t = createTranslator({
      locale: "pt-BR",
      messages: messages["pt-BR"],
    });
    expect(t(message.key, message.values)).toBe(
      "Registro 8: gross_minor deve ser um inteiro dentro dos limites",
    );
    const unknown = describeError(
      "Unknown backend error containing private source data",
    );
    expect(unknown).toEqual({ key: "errors.generic" });
  });
  it("preserves message descriptors until rendering so active errors change language", () => {
    expect(
      describeError(
        new MessageError({
          key: "errors.header",
          values: { header: "order_id,currency" },
        }),
      ),
    ).toEqual({
      key: "errors.header",
      values: { header: "order_id,currency" },
    });
    const invalid = connectionSchema.safeParse({ apiUrl: "", apiKey: "short" });
    expect(
      invalid.error?.issues.every((issue) =>
        issue.message.startsWith("errors."),
      ),
    ).toBe(true);
    expect(batchSchema.safeParse("bad/key").error?.issues[0].message).toBe(
      "errors.batch",
    );
    expect(
      runInputSchema.safeParse({
        orders_import_id: "",
        transactions_import_id: "",
        deposits_import_id: "",
      }).error?.issues,
    ).toHaveLength(3);
  });
});

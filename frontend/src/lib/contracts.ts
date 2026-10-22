import { z } from "zod";

export const kinds = ["orders", "transactions", "deposits"] as const;
export type ImportKind = (typeof kinds)[number];
export const schemas: Record<ImportKind, string> = {
  orders: "order_id,currency,expected_gross_minor,expected_refund_minor",
  transactions:
    "transaction_id,order_id,payout_id,currency,kind,gross_minor,fee_minor",
  deposits: "deposit_id,payout_id,currency,amount_minor",
};
export const MAX_BYTES = 2 * 1024 * 1024;
const integer = z
  .number()
  .int()
  .refine(Number.isSafeInteger, "errors.precision");
export const importSchema = z.object({
  id: z.string(),
  kind: z.enum(kinds),
  batch_key: z.string(),
  sha256: z.string(),
  row_count: z.number().int().nonnegative(),
  created_at: z.string(),
});
export const summarySchema = z.object({
  orders: integer,
  payouts: integer,
  matched_orders: integer,
  matched_payouts: integer,
  exceptions: integer,
  issue_counts: z.record(z.string(), integer),
});
export const runSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  status: z.enum(["attention", "balanced"]),
  summary: summarySchema,
  fingerprint: z.string(),
});
const resultFields = {
  status: z.enum(["attention", "matched"]),
  issues: z.array(z.string()),
  transaction_ids: z.array(z.string()),
};
export const orderSchema = z.object({
  ...resultFields,
  order_id: z.string(),
  currency: z.string().nullable(),
  observed_currencies: z.array(z.string()),
  expected_gross_minor: integer.nullable(),
  actual_gross_minor: integer.nullable(),
  expected_refund_minor: integer.nullable(),
  actual_refund_minor: integer.nullable(),
});
export const payoutSchema = z.object({
  ...resultFields,
  payout_id: z.string(),
  expected_net_by_currency: z.record(z.string(), integer),
  deposited_by_currency: z.record(z.string(), integer),
  delta_minor: integer.nullable(),
  deposit_ids: z.array(z.string()),
});
export const reportSchema = runSchema.extend({
  rules_version: z.string(),
  is_sample: z.boolean().default(false),
  inputs: z.object({
    orders: importSchema,
    transactions: importSchema,
    deposits: importSchema,
  }),
  totals_by_currency: z.record(
    z.string(),
    z.object({
      charged_minor: integer,
      refunded_minor: integer,
      fee_minor: integer,
      net_minor: integer,
      deposited_minor: integer,
    }),
  ),
  orders: z.array(orderSchema),
  payouts: z.array(payoutSchema),
});
export type ImportRecord = z.infer<typeof importSchema>;
export type Run = z.infer<typeof runSchema>;
export type Report = z.infer<typeof reportSchema>;
export type OrderResult = z.infer<typeof orderSchema>;
export type PayoutResult = z.infer<typeof payoutSchema>;
export const connectionSchema = z.object({
  apiUrl: z.string().min(1, "errors.address"),
  apiKey: z.string().regex(/^[\x21-\x7e]{32,256}$/, "errors.key"),
});
export const runInputSchema = z.object({
  orders_import_id: z
    .string()
    .regex(/^[a-f0-9]{32}$/, "errors.ordersSelection"),
  transactions_import_id: z
    .string()
    .regex(/^[a-f0-9]{32}$/, "errors.transactionsSelection"),
  deposits_import_id: z
    .string()
    .regex(/^[a-f0-9]{32}$/, "errors.depositsSelection"),
});
export const batchSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/, "errors.batch");

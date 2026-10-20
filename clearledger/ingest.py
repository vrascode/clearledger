"""Bounded, strict CSV parsing; monetary values never pass through float."""

import csv
import io
import re

from .errors import LedgerError

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 10_000
MAX_AMOUNT = 100_000_000_000
CURRENCIES = frozenset({"BRL", "USD", "EUR", "GBP", "JPY"})
SCHEMAS = {
    "orders": ("order_id", "currency", "expected_gross_minor", "expected_refund_minor"),
    "transactions": (
        "transaction_id",
        "order_id",
        "payout_id",
        "currency",
        "kind",
        "gross_minor",
        "fee_minor",
    ),
    "deposits": ("deposit_id", "payout_id", "currency", "amount_minor"),
}
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}\Z")
INTEGER = re.compile(r"-?(?:0|[1-9][0-9]{0,11})\Z")


def identifier(value: str, field: str = "identifier") -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise LedgerError(
            f"{field} must be 1-80 ASCII letters, digits, _, ., : or -; start alphanumeric"
        )
    return value


def parse_csv(kind: str, data: bytes) -> list[dict]:
    if kind not in SCHEMAS:
        raise LedgerError("kind must be orders, transactions or deposits")
    if len(data) > MAX_BYTES:
        raise LedgerError(f"CSV exceeds {MAX_BYTES} bytes")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise LedgerError("CSV must be UTF-8") from exc
    if "\x00" in text:
        raise LedgerError("CSV cannot contain NUL characters")
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    schema = SCHEMAS[kind]
    result = []
    seen = set()
    try:
        if tuple(next(reader, [])) != schema:
            raise LedgerError(f"CSV header must be exactly: {','.join(schema)}")
        for index, values in enumerate(reader, start=2):
            if len(result) >= MAX_ROWS:
                raise LedgerError(f"CSV exceeds {MAX_ROWS} records")
            if len(values) != len(schema):
                raise LedgerError(f"Record {index}: incorrect column count")
            row = dict(zip(schema, values, strict=True))
            for field, value in row.items():
                if field.endswith("_id"):
                    identifier(value, f"Record {index}: {field}")
                elif field.endswith("_minor"):
                    if not INTEGER.fullmatch(value) or abs(int(value)) > MAX_AMOUNT:
                        raise LedgerError(f"Record {index}: {field} must be a bounded integer")
                    row[field] = int(value)
            if row["currency"] not in CURRENCIES:
                raise LedgerError(f"Record {index}: unsupported currency")
            if kind == "orders":
                if not 0 <= row["expected_refund_minor"] <= row["expected_gross_minor"]:
                    raise LedgerError(f"Record {index}: refund must be between zero and gross")
                if row["expected_gross_minor"] <= 0:
                    raise LedgerError(f"Record {index}: expected gross must be positive")
            if kind == "transactions":
                gross, fee = row["gross_minor"], row["fee_minor"]
                if row["kind"] == "charge":
                    valid = gross > 0 and 0 <= fee <= gross
                elif row["kind"] == "refund":
                    valid = gross < 0 and abs(fee) <= abs(gross)
                else:
                    valid = False
                if not valid:
                    raise LedgerError(f"Record {index}: invalid transaction kind, sign or fee")
            key = values[0]
            if key in seen:
                raise LedgerError(f"Record {index}: duplicate source identifier")
            seen.add(key)
            result.append(row)
    except csv.Error as exc:
        raise LedgerError("Malformed CSV") from exc
    return result

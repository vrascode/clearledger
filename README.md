# ClearLedger

[Português (Brasil)](README.pt-BR.md)

**Work in progress.** A working three-way settlement reconciliation service for
finance operations. Compare expected order charges/refunds with payment
transactions, then compare each payout's net amount with bank deposits.
It identifies exceptions for investigation; it does not move funds.

Implemented: atomic CSV imports, idempotency and conflict detection, split
charges, refunds and fee reversals, separate currency totals, immutable SQLite
reports, authenticated FastAPI endpoints, CLI, JSON/CSV exports and synthetic
examples. **64 automated tests passed locally on Python 3.12.10 / Windows.**

Pending: live-server smoke test, dependency vulnerability review, execution
screenshots and operational hardening. No production deployment or commercial
validation has occurred. Projects elsewhere in the portfolio are not part of
this repository.

## Quick start

Run from this project's directory. In the portfolio workspace this is
`C:\ProjetosNovo\projects\01-clearledger`; in a standalone clone it is the
repository root.

```powershell
python -m venv .venv
New-Item -ItemType Directory -Force -Path .tmp,.cache | Out-Null
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path (Get-Location) '.cache\pip'
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements-dev.lock
.\.venv\Scripts\python.exe -m clearledger demo
```

The demo persists data in `.runtime/clearledger.sqlite3`. It produces 6 order
results and 3 payout results, with **5 exceptions**: missing payment, incorrect
gross amount, unknown order, missing bank deposit, and payout amount mismatch.
Re-running returns the same report. Example data is synthetic.

On Linux/macOS, use `.venv/bin/python` instead of `.venv\Scripts\python.exe` and
create `.tmp` / `.cache` with `mkdir -p`. Windows is the validated platform so far.
For runtime-only installation use `requirements.lock`.

## API

```powershell
$env:CLEARLEDGER_API_KEY = & .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
.\.venv\Scripts\python.exe -m uvicorn clearledger.api:from_env --factory --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the OpenAPI interface. Supply the generated
key through **Authorize**. Keep the key private; do not commit it.
`CLEARLEDGER_DB` optionally overrides the default database path.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/v1/imports/{orders,transactions,deposits}?batch_key=source-v1` | Upload raw UTF-8 CSV with `Content-Type: text/csv` |
| GET | `/v1/imports?limit=50&offset=0` | Inspect import metadata and hashes |
| POST | `/v1/runs` | Select `orders_import_id`, `transactions_import_id`, `deposits_import_id` |
| GET | `/v1/runs` | List persisted run summaries |
| GET | `/v1/runs/{id}` | Read the immutable full report |
| GET | `/v1/runs/{id}/export?format=csv` | Export CSV or JSON |
| GET | `/healthz`, `/readyz` | Liveness and database readiness |

All `/v1` routes require `X-API-Key`. New imports/runs return 201; exact replays
return 200. Reusing a batch key with different bytes returns 409. Invalid input
returns 422, unsupported content type 415, oversized HTTP bodies 413, missing
records 404 and unavailable storage 503. Health and API schema are public and
expose no business records.

## CLI and tests

```powershell
.\.venv\Scripts\python.exe -m clearledger import orders examples/orders.csv --batch-key finance-v1
.\.venv\Scripts\python.exe -m clearledger run --orders ORDERS_IMPORT_ID --transactions TRANSACTIONS_IMPORT_ID --deposits DEPOSITS_IMPORT_ID
.\.venv\Scripts\python.exe -m clearledger show RUN_ID
.\.venv\Scripts\python.exe -m clearledger export RUN_ID --format csv --output .tmp/report.csv
.\.venv\Scripts\python.exe -m pytest -q --basetemp .tmp/pytest --tb=short
.\.venv\Scripts\python.exe -m ruff check clearledger tests
.\.venv\Scripts\python.exe -m pip check
```

Replace capitalized IDs with returned values. Global `--db PATH` goes before the
subcommand. Exports refuse to overwrite files. `run` and `demo` accept
`--fail-on-exceptions` (exit 3 when discrepancies exist); invalid operations exit
1 and argument syntax errors exit 2. CLI access is trusted local database access,
not subject to API authentication.

Tests cover failure validation, rollback, immutable storage, replay conflicts,
concurrent import/run creation, restart durability, currency mismatches,
refunds, HTTP authentication, streaming body limits and CLI subprocesses.
The current dependency set emits one Starlette test-client deprecation warning;
tests pass, and dependency compatibility review remains pending.

## CSV contract and limits

Use the exact headers and order in [examples](examples). IDs are 1–80 ASCII
characters, start alphanumeric, and may contain `_ . : -`. Currency is one of
BRL, USD, EUR, GBP, JPY. Amounts are integer **minor units**, never decimals.
Each amount has absolute value at most 100,000,000,000. Each file is at most
2 MiB / 10,000 records. Duplicate source IDs within an import reject the file.

Charges have positive gross and nonnegative fees no greater than gross. Refund
gross is negative; its fee can be positive (cost) or negative (fee reversal),
bounded by the refund magnitude. Expected refund is nonnegative and no greater
than expected gross. Payout net is `sum(gross - fee)`; deposits may be negative
for bank debits. Splits aggregate by exact order or payout ID.

Imports are immutable, named source snapshots. A new/corrected window needs a
new batch key and run. Byte-identical retries under the same key are idempotent;
even newline changes alter the content hash. Header-only inputs are allowed to
represent no observations, but three empty inputs cannot create a run.

Supply complete, aligned settlement windows yourself. There is no automatic
date matching, foreign exchange conversion, tolerance, fuzzy match, direct
Stripe adapter, dispute/standalone-fee support, or automatic remediation.
An apparent exception may be a timing difference in incomplete source data.
Multiple currencies on one payout ID are flagged, never netted together.

## Architecture and operating limits

See [architecture](ARCHITECTURE.md), [security](SECURITY.md),
[delivery record](COMMITS.md), and the [unpublished post draft](POST.md).
SQLite suits a single-host pilot; write transactions serialize. This is not yet
a multi-tenant service: one API key grants access to the entire database.
Production use needs TLS, access policy, secret rotation, rate limits, encrypted
storage, backups/restore validation, monitoring and capacity testing.

No GitHub Actions run or remote deployment is implied by local test results.
Development uses AI assistance and genuine incremental Git commits.

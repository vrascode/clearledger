# ClearLedger

[Português (Brasil)](README.pt-BR.md)

An English / Brazilian Portuguese reconciliation dashboard for finance
operations, backed by FastAPI and SQLite. Compare expected order charges/refunds with payment
transactions, then compare each payout's net amount with bank deposits.
It identifies exceptions for investigation; it does not move funds.

Implemented: atomic CSV imports, idempotency and conflict detection, split
charges, refunds and fee reversals, separate currency totals, immutable SQLite
reports, authenticated FastAPI endpoints, CLI, JSON/CSV exports and synthetic
examples. The Next.js dashboard includes overview, reconciliation, CSV imports,
runs, reporting and local connection settings, with light/dark themes.

This remains a single-host prototype. No production deployment or commercial
validation is claimed. See [verified results and limitations](PROGRESS.md).
Projects elsewhere in the portfolio are not part of this repository.

## Run the dashboard

Prerequisites: Python 3.12+, Node.js 22+ and npm. Install the Python dependencies
using the quick-start commands below, then run from the project root:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run build
npm.cmd run start:local
```

Open **http://127.0.0.1:3000**. The launcher starts FastAPI on port 8000 and
Next.js on port 3000, generates a shared API key in process memory, and keeps
the database in `.runtime/clearledger.sqlite3`. It refuses occupied ports.
Press Ctrl+C to stop both services. Logs remain in `.runtime/`; the key is
never printed. Use `npm.cmd run dev:local` for frontend development.
On Linux/macOS use `npm` instead of `npm.cmd`.

Choose **Explore sample data** to import the existing synthetic CSVs through
the real API and run reconciliation. Repeating the action reuses the immutable
imports/report. The **Sample Data** banner is based on the three source content
hashes. Alternatively, import your CSVs and select one dataset of each kind in
**Reconciliation runs**. Table filters, sorting, pagination, details and exports
use actual persisted reports.

For separately managed services, set `CLEARLEDGER_API_URL` and
`CLEARLEDGER_API_KEY` in the Next.js server environment (see
[the environment example](frontend/.env.example)); set the same key in FastAPI.
Run `npm.cmd run dev` or `npm.cmd run start` for Next.js only. The Settings page
can verify a loopback URL and key for an eight-hour browser session. The key is
held in server memory and the browser receives an opaque HttpOnly cookie.
Resetting the session returns to the environment configuration, without deleting
data. `CLEARLEDGER_EXAMPLES_DIR` optionally sets the example CSV directory.
Never use `NEXT_PUBLIC_` for credentials.

## Languages and financial presentation

The globe selector in every page header switches instantly between **English
(US)** (`en-US`) and **Português (Brasil)** (`pt-BR`). It supports keyboard
navigation and indicates the selected language. The preference is a one-year
`clearledger-locale` cookie, separate from authentication. Reopening the app
restores it. Without a valid preference, the server negotiates `Accept-Language`
(English/Portuguese regional variants supported), falling back to English.
The initial HTML and client provider use the same locale to avoid hydration
mismatches. Switching keeps the current route, filters and form state; it does
not reload the page or refetch financial records.

Dates, counts, percentages and monetary amounts follow the selected locale.
Timestamps explicitly use **UTC** in both languages for consistent audit
references. BRL 125050 minor units displays as `R$1,250.50` in English and
`R$ 1.250,50` in Portuguese; JPY uses zero decimals. Formatting preserves exact
integer amounts with BigInt parts. **Currency is never converted.** Expected
payments are order gross minus expected refunds; processed payments are charges
minus actual refunds. Net settlement additionally subtracts fees. Matching rate
counts matched records; completed checks do not mean exceptions are resolved.

Translation maintenance:

- Edit both [English messages](frontend/messages/en-US.json) and
  [Portuguese messages](frontend/messages/pt-BR.json). Use identical keys and ICU
  placeholders/plurals; do not build sentences by concatenating translated fragments.
- Use `useI18n()` from `frontend/src/i18n/provider.tsx`. The `next-intl`
  `AppConfig` augmentation gives typed keys. Catalog shape, ICU arguments and
  every message are checked automatically. JSX copy and accessible labels have
  a regression check against hardcoded text.
- Use the shared money, date, number and percentage formatters. Keep API fields,
  CSV headers, routes, source IDs, stored records and exported reports unchanged.
- Add frontend error mappings in `frontend/src/i18n/errors.ts` for any new backend
  diagnostic. Unknown messages receive a safe localized explanation. Store
  descriptors for validation/toasts so visible messages also update on switching.

## Frontend verification

From `frontend/`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run build
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Resolve-Path ..) '.cache\ms-playwright'
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit --omit=dev
```

The browser runner launches the production Next.js build and a real Uvicorn
process on ports 13000/18000 with a generated key and a fresh SQLite database in
`.tmp/`. It shuts down its owned processes, never substitutes API responses,
and captures genuine English/Portuguese desktop, mobile, tablet and dark-mode
screenshots in `.runtime/screenshots/`. Generated evidence is intentionally
ignored by Git. See [PROGRESS.md](PROGRESS.md) for exact results, including
dependency advisory limitations. `CLEARLEDGER_PYTHON` can override the local
virtual-environment interpreter for the launchers and contract tests.

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
tests pass. It is confined to the in-process test client; real browser tests
also exercise the API over HTTP. Migration to the new test client is deferred
to a separate dependency change.

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
[delivery record](COMMITS.md), [checkpoint and resume steps](PROGRESS.md),
and the [unpublished post draft](POST.md).
SQLite suits a single-host pilot; write transactions serialize. This is not yet
a multi-tenant service: one API key grants access to the entire database.
Production use needs TLS, access policy, secret rotation, rate limits, encrypted
storage, backups/restore validation, monitoring and capacity testing.

No GitHub Actions run or remote deployment is implied by local test results.
Development uses AI assistance and genuine incremental Git commits.

# ClearLedger checkpoint

[Português (Brasil)](PROGRESS.pt-BR.md)

Checkpoint date: **2026-10-20**. Status: **work in progress**, private repository:
https://github.com/vrascode/clearledger. Not production deployed or production approved.

## Verified delivery

- Strict normalized CSV imports for orders, transactions and bank deposits.
- Atomic, immutable SQLite snapshots; content hashes; idempotent retries and
  conflicts when the same batch key is reused with different content.
- Split charges, refunds and fee reversals; order/payout discrepancy reports;
  amounts kept as integers and totals separated by currency.
- Authenticated FastAPI API, bounded request bodies, safe validation errors,
  request IDs, pagination, JSON/CSV exports, and a local CLI.
- Synthetic examples: 6 order results, 3 payout results, 5 exceptions.
- English/Portuguese setup, architecture, security, commit record and post draft.
  The post draft has not been sent to any social platform.

## Validation evidence

Environment: Windows, Python 3.12.10. Commands ran from the project directory:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp .tmp/pytest-service --tb=short
.\.venv\Scripts\python.exe -m ruff check clearledger tests
.\.venv\Scripts\python.exe -m pip check
```

Results: **64 tests passed**, lint passed, no broken package requirements.
One Starlette/httpx test-client deprecation warning remains. Tests include
concurrent imports/runs, rollback, persistence after restart, invalid data,
authentication, streaming limits and actual CLI subprocesses.

Initial publication was verified against GitHub: PRIVATE, default branch `main`,
expected code/tests/examples/docs/lockfiles present. The source tree and original
authors, author dates, commit dates and messages matched the extracted history.
Credential-pattern and forbidden-file checks passed for the working tree and all
project history; manual review found only the explicitly marked test fixture key.

## Exact resume instructions

The development source is `C:\ProjetosNovo\projects\01-clearledger`. Read the
workspace's `AGENTS.md` and `PORTFOLIO_PROGRESS.md`, then inspect Git status before
making changes. Do not start from the publication clone.

1. Finish **P01.2** by adding and running a live HTTP smoke script: start Uvicorn
   on loopback with a generated key and temporary database inside the workspace;
   check unauthorized access; import all three examples; create/replay a run;
   verify the five expected exceptions and CSV export; shut down the child process.
   Current HTTP tests use an in-process ASGI client, not a live listening server.
2. Finish **P01.3**: run the dependency advisory check, assess the Starlette/httpx
   compatibility warning, capture a useful screenshot from a running application
   if feasible, and document backup/restore and operating limits. Do not claim
   any of these checks have already passed.
3. Run relevant tests and lint after changes, review secrets and tracked files,
   update progress, and create a genuine Conventional Commit.
4. Follow the workspace's `docs/PUBLISHING.md`: subtree split, fast-forward the
   independent clone, confirm PRIVATE visibility/account, push normally, and
   compare the remote SHA. Further private milestone pushes are authorized.
5. Only after ClearLedger's acceptance gate passes, start Project 02's durable
   outbox and leased worker milestone. Projects 02–05 currently have no code.

Dependencies, runtime databases, caches, virtual environments and temporary
publication checkouts remain local and ignored. Production hardening still
requires TLS/access control, rate limits, key rotation, backup validation,
monitoring and capacity testing. No production-readiness claim is made.

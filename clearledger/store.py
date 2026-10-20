"""SQLite repository with immutable snapshots and serialized write transactions."""

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .errors import Conflict, LedgerError, NotFound, Unavailable
from .ingest import identifier, parse_csv
from .reconcile import RULES_VERSION, reconcile

SCHEMA = """
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('orders', 'transactions', 'deposits')),
    batch_key TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    created_at TEXT NOT NULL,
    UNIQUE(kind, batch_key)
);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    orders_import_id TEXT NOT NULL REFERENCES imports(id),
    transactions_import_id TEXT NOT NULL REFERENCES imports(id),
    deposits_import_id TEXT NOT NULL REFERENCES imports(id),
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS imports_no_update BEFORE UPDATE ON imports
BEGIN SELECT RAISE(ABORT, 'imports are immutable'); END;
CREATE TRIGGER IF NOT EXISTS imports_no_delete BEFORE DELETE ON imports
BEGIN SELECT RAISE(ABORT, 'imports are immutable'); END;
CREATE TRIGGER IF NOT EXISTS runs_no_update BEFORE UPDATE ON runs
BEGIN SELECT RAISE(ABORT, 'runs are immutable'); END;
CREATE TRIGGER IF NOT EXISTS runs_no_delete BEFORE DELETE ON runs
BEGIN SELECT RAISE(ABORT, 'runs are immutable'); END;
PRAGMA user_version = 1;
COMMIT;
"""


def now() -> str:
    return datetime.now(UTC).isoformat()


def serialize(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise Unavailable("Unsupported database schema version")
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)

    @contextmanager
    def connection(self, *, write=False):
        connection = None
        try:
            connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys=ON")
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            if write:
                connection.commit()
        except sqlite3.Error as exc:
            if connection is not None and connection.in_transaction:
                connection.rollback()
            raise Unavailable("Database operation unavailable; retry later") from exc
        except Exception:
            if connection is not None and connection.in_transaction:
                connection.rollback()
            raise
        finally:
            if connection is not None:
                connection.close()

    @staticmethod
    def metadata(row) -> dict:
        return {
            key: row[key]
            for key in ("id", "kind", "batch_key", "sha256", "row_count", "created_at")
        }

    def import_csv(self, kind: str, data: bytes, batch_key: str) -> tuple[dict, bool]:
        identifier(batch_key, "batch_key")
        rows = parse_csv(kind, data)
        digest = hashlib.sha256(data).hexdigest()
        with self.connection(write=True) as connection:
            existing = connection.execute(
                "SELECT * FROM imports WHERE kind=? AND batch_key=?", (kind, batch_key)
            ).fetchone()
            if existing:
                if existing["sha256"] != digest:
                    raise Conflict("Batch key already exists with different content")
                return self.metadata(existing), False
            import_id = uuid4().hex
            connection.execute(
                "INSERT INTO imports VALUES (?, ?, ?, ?, ?, ?, ?)",
                (import_id, kind, batch_key, digest, serialize(rows), len(rows), now()),
            )
            row = connection.execute("SELECT * FROM imports WHERE id=?", (import_id,)).fetchone()
            return self.metadata(row), True

    def list_imports(self, limit: int = 50, offset: int = 0) -> list[dict]:
        with self.connection() as connection:
            return [
                self.metadata(row)
                for row in connection.execute(
                    "SELECT * FROM imports ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            ]

    def create_run(
        self, orders_id: str, transactions_id: str, deposits_id: str
    ) -> tuple[dict, bool]:
        ids = (orders_id, transactions_id, deposits_id)
        for value in ids:
            identifier(value, "import_id")
        fingerprint = hashlib.sha256(serialize([RULES_VERSION, *ids]).encode()).hexdigest()
        with self.connection(write=True) as connection:
            previous = connection.execute(
                "SELECT report_json FROM runs WHERE fingerprint=?", (fingerprint,)
            ).fetchone()
            if previous:
                return json.loads(previous["report_json"]), False
            imports = {}
            for kind, import_id in zip(("orders", "transactions", "deposits"), ids, strict=True):
                row = connection.execute(
                    "SELECT * FROM imports WHERE id=?", (import_id,)
                ).fetchone()
                if not row:
                    raise NotFound(f"{kind} import not found")
                if row["kind"] != kind:
                    raise LedgerError(f"Selected {kind} import has the wrong kind")
                imports[kind] = row
            if not any(row["row_count"] for row in imports.values()):
                raise LedgerError("Cannot reconcile three empty imports")
            report = reconcile(*(json.loads(row["rows_json"]) for row in imports.values()))
            report.update(
                {
                    "id": uuid4().hex,
                    "created_at": now(),
                    "fingerprint": fingerprint,
                    "inputs": {kind: self.metadata(row) for kind, row in imports.items()},
                }
            )
            connection.execute(
                "INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?)",
                (report["id"], fingerprint, *ids, serialize(report), report["created_at"]),
            )
            return report, True

    def get_run(self, run_id: str) -> dict:
        identifier(run_id, "run_id")
        with self.connection() as connection:
            row = connection.execute(
                "SELECT report_json FROM runs WHERE id=?", (run_id,)
            ).fetchone()
            if not row:
                raise NotFound("Run not found")
            return json.loads(row["report_json"])

    def list_runs(self, limit: int = 50, offset: int = 0) -> list[dict]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT report_json FROM runs ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
                (limit, offset),
            )
            return [
                {
                    key: report[key]
                    for key in ("id", "created_at", "status", "summary", "fingerprint")
                }
                for report in (json.loads(row["report_json"]) for row in rows)
            ]

    def health(self) -> bool:
        with self.connection() as connection:
            return connection.execute("SELECT 1").fetchone()[0] == 1

import argparse
import json
import os
import sys
from pathlib import Path

from .errors import LedgerError
from .export import export_report
from .ingest import MAX_BYTES, SCHEMAS
from .store import Store


def read_bounded(path: Path) -> bytes:
    with path.open("rb") as source:
        return source.read(MAX_BYTES + 1)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="ClearLedger settlement reconciliation")
    parser.add_argument("--db", default=os.getenv("CLEARLEDGER_DB", ".runtime/clearledger.sqlite3"))
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import", help="Import one normalized CSV snapshot")
    importer.add_argument("kind", choices=SCHEMAS)
    importer.add_argument("file", type=Path)
    importer.add_argument("--batch-key", required=True)
    runner = commands.add_parser("run", help="Reconcile three explicit import IDs")
    for kind in SCHEMAS:
        runner.add_argument(f"--{kind}", required=True)
    runner.add_argument("--fail-on-exceptions", action="store_true")
    shower = commands.add_parser("show", help="Read a persisted report")
    shower.add_argument("run_id")
    exporter = commands.add_parser(
        "export", help="Export a report; never overwrite an existing file"
    )
    exporter.add_argument("run_id")
    exporter.add_argument("--format", choices=("json", "csv"), default="json")
    exporter.add_argument("--output", type=Path, required=True)
    demo = commands.add_parser("demo", help="Import synthetic examples and reconcile them")
    demo.add_argument("--fail-on-exceptions", action="store_true")
    args = parser.parse_args(argv)
    try:
        store = Store(args.db)
        if args.command == "import":
            result, _ = store.import_csv(args.kind, read_bounded(args.file), args.batch_key)
        elif args.command == "run":
            result, _ = store.create_run(args.orders, args.transactions, args.deposits)
        elif args.command == "demo":
            examples = Path(__file__).resolve().parents[1] / "examples"
            ids = [
                store.import_csv(kind, read_bounded(examples / f"{kind}.csv"), "synthetic-v1")[0][
                    "id"
                ]
                for kind in SCHEMAS
            ]
            result, _ = store.create_run(*ids)
        elif args.command == "show":
            result = store.get_run(args.run_id)
        else:
            report = store.get_run(args.run_id)
            # Exclusive creation prevents silently overwriting evidence or input files.
            with args.output.open("x", encoding="utf-8", newline="") as output:
                output.write(export_report(report, args.format))
            result = {"run_id": report["id"], "format": args.format, "exported": True}
        print(json.dumps(result, indent=2, sort_keys=True))
        if getattr(args, "fail_on_exceptions", False) and result["status"] == "attention":
            return 3
        return 0
    except LedgerError as error:
        print(json.dumps({"error": {"code": error.code, "message": str(error)}}), file=sys.stderr)
        return 1
    except OSError:
        print(
            json.dumps({"error": {"code": "file_error", "message": "Unable to access file"}}),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

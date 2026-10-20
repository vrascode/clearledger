import json
import os
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


def cli(tmp_path, *args):
    return subprocess.run(
        [sys.executable, "-m", "clearledger", "--db", str(tmp_path / "cli.sqlite3"), *args],
        cwd=PROJECT,
        capture_output=True,
        text=True,
        timeout=20,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )


def test_cli_demo_is_replayable_and_persistent_across_processes(tmp_path):
    result = cli(tmp_path, "demo")
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["summary"]["exceptions"] == 5
    replay = cli(tmp_path, "demo", "--fail-on-exceptions")
    assert replay.returncode == 3 and json.loads(replay.stdout) == report
    show = cli(tmp_path, "show", report["id"])
    assert show.returncode == 0 and json.loads(show.stdout) == report
    run = cli(
        tmp_path,
        "run",
        "--orders",
        report["inputs"]["orders"]["id"],
        "--transactions",
        report["inputs"]["transactions"]["id"],
        "--deposits",
        report["inputs"]["deposits"]["id"],
    )
    assert run.returncode == 0 and json.loads(run.stdout) == report


def test_cli_export_never_overwrites_evidence(tmp_path):
    report = json.loads(cli(tmp_path, "demo").stdout)
    output = tmp_path / "report.json"
    first = cli(tmp_path, "export", report["id"], "--output", str(output))
    assert first.returncode == 0 and json.loads(output.read_text()) == report
    duplicate = cli(tmp_path, "export", report["id"], "--output", str(output))
    assert duplicate.returncode == 1
    assert json.loads(output.read_text()) == report


def test_cli_errors_are_safe_and_nonzero(tmp_path):
    result = cli(
        tmp_path, "import", "orders", str(tmp_path / "private-missing.csv"), "--batch-key", "k"
    )
    assert result.returncode == 1 and "private-missing" not in result.stderr
    result = cli(tmp_path, "show", "unknown")
    assert result.returncode == 1
    assert json.loads(result.stderr)["error"]["code"] == "not_found"


def test_cli_import(tmp_path):
    result = cli(
        tmp_path,
        "import",
        "orders",
        str(PROJECT / "examples" / "orders.csv"),
        "--batch-key",
        "cli-source",
    )
    assert result.returncode == 0 and json.loads(result.stdout)["row_count"] == 5

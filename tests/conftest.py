from pathlib import Path

import pytest

from clearledger.store import Store

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "ledger.sqlite3")


@pytest.fixture
def sample_ids(store):
    return tuple(
        store.import_csv(kind, (EXAMPLES / f"{kind}.csv").read_bytes(), "demo-v1")[0]["id"]
        for kind in ("orders", "transactions", "deposits")
    )

from concurrent.futures import ThreadPoolExecutor

import pytest

from clearledger.errors import Conflict, LedgerError, NotFound, Unavailable
from clearledger.ingest import MAX_BYTES, SCHEMAS, parse_csv
from clearledger.store import Store

ORDERS = b"order_id,currency,expected_gross_minor,expected_refund_minor\nO1,BRL,10000,2500\n"
TXS = (
    b"transaction_id,order_id,payout_id,currency,kind,gross_minor,fee_minor\n"
    b"T1,O1,P1,BRL,charge,6000,180\n"
    b"T2,O1,P1,BRL,charge,4000,120\n"
    b"T3,O1,P1,BRL,refund,-2500,-75\n"
)
BANK = b"deposit_id,payout_id,currency,amount_minor\nD1,P1,BRL,7275\n"


def load(store, orders=ORDERS, transactions=TXS, deposits=BANK, key="test"):
    return tuple(
        store.import_csv(kind, data, key)[0]["id"]
        for kind, data in zip(
            ("orders", "transactions", "deposits"), (orders, transactions, deposits), strict=True
        )
    )


def test_split_charges_refunds_and_fee_reversal_balance(store):
    report, created = store.create_run(*load(store))
    assert created and report["status"] == "balanced"
    assert report["orders"][0]["actual_gross_minor"] == 10000
    assert report["orders"][0]["actual_refund_minor"] == 2500
    assert report["totals_by_currency"]["BRL"] == {
        "charged_minor": 10000,
        "refunded_minor": 2500,
        "fee_minor": 225,
        "net_minor": 7275,
        "deposited_minor": 7275,
    }


def test_example_has_five_exceptions_and_no_cross_currency_total(store, sample_ids):
    report, _ = store.create_run(*sample_ids)
    assert report["summary"] == {
        "orders": 6,
        "payouts": 3,
        "matched_orders": 3,
        "matched_payouts": 1,
        "exceptions": 5,
        "issue_counts": {
            "missing_payment": 1,
            "gross_mismatch": 1,
            "unexpected_order": 1,
            "missing_deposit": 1,
            "net_mismatch": 1,
        },
    }
    assert report["totals_by_currency"]["BRL"]["net_minor"] == 29003
    assert report["totals_by_currency"]["USD"]["net_minor"] == 11640


def test_import_replay_and_conflict_are_persistent(store):
    first, created = store.import_csv("orders", ORDERS, "source-1")
    reopened = Store(store.path)
    second, replay_created = reopened.import_csv("orders", ORDERS, "source-1")
    assert created and not replay_created and first == second
    with pytest.raises(Conflict):
        reopened.import_csv("orders", ORDERS.replace(b"10000", b"10001"), "source-1")
    assert reopened.list_imports() == [first]


def test_report_survives_restart_and_new_import_does_not_rewrite_it(store):
    ids = load(store)
    report, _ = store.create_run(*ids)
    changed_ids = load(store, deposits=BANK.replace(b"7275", b"7274"), key="corrected")
    changed, _ = store.create_run(*changed_ids)
    restarted = Store(store.path)
    assert restarted.get_run(report["id"]) == report
    assert changed["status"] == "attention"
    replay, created = restarted.create_run(*ids)
    assert replay == report and not created
    assert len(restarted.list_runs()) == 2


def test_concurrent_import_and_run_create_only_one_each(store):
    def import_one(_):
        return store.import_csv("orders", ORDERS, "concurrent")

    with ThreadPoolExecutor(max_workers=6) as executor:
        imports = list(executor.map(import_one, range(12)))
    assert sum(created for _, created in imports) == 1
    assert len({row["id"] for row, _ in imports}) == 1
    ids = load(store)
    with ThreadPoolExecutor(max_workers=6) as executor:
        runs = list(executor.map(lambda _: store.create_run(*ids), range(12)))
    assert sum(created for _, created in runs) == 1
    assert len({row["id"] for row, _ in runs}) == 1


@pytest.mark.parametrize(
    "bad",
    [
        ORDERS + b"O1,BRL,10000,0\n",
        ORDERS + b"O2,BRL,9.99,0\n",
        ORDERS + b"O2,BRL,0,0\n",
        ORDERS + b"O2,BRL,100,101\n",
        ORDERS + b"O2,ZZZ,100,0\n",
        ORDERS + b"=formula,BRL,100,0\n",
        ORDERS + b"O2,BRL,100\n",
        ORDERS + b"O2,BRL,100,0,extra\n",
        ORDERS + b"O2,BRL,100000000001,0\n",
        ORDERS + b"O2,BRL, 100,0\n",
        ORDERS + b"O2,BRL,1e3,0\n",
        ORDERS + b"O2,BRL,NaN,0\n",
        b"order_id,currency,expected_gross_minor,expected_gross_minor\n",
        b"\xff",
        b"\x00",
        b"",
        ORDERS + b'"unterminated',
        b"x" * (MAX_BYTES + 1),
    ],
    ids=lambda data: f"bytes-{len(data)}",
)
def test_invalid_import_is_all_or_nothing(store, bad):
    with pytest.raises(LedgerError):
        store.import_csv("orders", bad, "invalid")
    assert store.list_imports() == []


@pytest.mark.parametrize(
    "row",
    [
        b"T1,O1,P1,BRL,charge,-10,0",
        b"T1,O1,P1,BRL,charge,10,-1",
        b"T1,O1,P1,BRL,charge,10,11",
        b"T1,O1,P1,BRL,refund,10,0",
        b"T1,O1,P1,BRL,refund,-10,11",
        b"T1,O1,P1,BRL,fee,10,0",
    ],
)
def test_invalid_transaction_signs_and_fees(row):
    with pytest.raises(LedgerError):
        parse_csv("transactions", TXS.split(b"\n")[0] + b"\n" + row + b"\n")


def test_wrong_currency_does_not_balance_equal_numbers(store):
    ids = load(store, transactions=TXS.replace(b"BRL", b"USD"))
    report, _ = store.create_run(*ids)
    assert "currency_mismatch" in report["orders"][0]["issues"]
    assert report["payouts"][0]["issues"] == ["currency_mismatch"]
    assert report["payouts"][0]["delta_minor"] is None


def test_refund_discrepancy_cannot_cancel_charge_discrepancy(store):
    ids = load(store, transactions=TXS.replace(b"6000", b"6100").replace(b"-2500", b"-2600"))
    report, _ = store.create_run(*ids)
    assert report["orders"][0]["issues"] == ["gross_mismatch", "refund_mismatch"]
    assert report["payouts"][0]["status"] == "matched"


def test_split_deposits_and_negative_refund_payout(store):
    split = BANK.replace(b"D1,P1,BRL,7275", b"D1,P1,BRL,4000\nD2,P1,BRL,3275")
    assert store.create_run(*load(store, deposits=split))[0]["status"] == "balanced"
    refund_txs = TXS.replace(b"T3,O1,P1", b"T3,O1,P2")
    refund_bank = BANK.replace(b"D1,P1,BRL,7275", b"D1,P1,BRL,9700\nD2,P2,BRL,-2425")
    report, _ = store.create_run(
        *load(store, transactions=refund_txs, deposits=refund_bank, key="refund-payout")
    )
    assert report["status"] == "balanced"


def test_missing_settlement_detected(store):
    bank = BANK + b"D2,ORPHAN,BRL,10\n"
    report, _ = store.create_run(*load(store, deposits=bank))
    assert report["summary"]["issue_counts"] == {"missing_settlement": 1}


def test_empty_run_wrong_kind_and_missing_id_are_rejected(store):
    ids = tuple(
        store.import_csv(kind, (",".join(fields) + "\n").encode(), "empty")[0]["id"]
        for kind, fields in SCHEMAS.items()
    )
    with pytest.raises(LedgerError, match="empty"):
        store.create_run(*ids)
    with pytest.raises(LedgerError, match="wrong kind"):
        store.create_run(ids[1], ids[0], ids[2])
    with pytest.raises(NotFound):
        store.create_run("nonexistent", ids[1], ids[2])
    assert not store.list_runs()


def test_database_enforces_immutability(store, sample_ids):
    report, _ = store.create_run(*sample_ids)
    with pytest.raises(Unavailable):
        with store.connection(write=True) as connection:
            connection.execute("DELETE FROM imports WHERE id=?", (sample_ids[0],))
    with pytest.raises(Unavailable):
        with store.connection(write=True) as connection:
            connection.execute("UPDATE runs SET report_json='{}' WHERE id=?", (report["id"],))
    assert store.get_run(report["id"]) == report


def test_failed_transaction_rolls_back_before_reopen(store):
    with pytest.raises(RuntimeError):
        with store.connection(write=True) as connection:
            connection.execute(
                "INSERT INTO imports VALUES ('temporary','orders','k','hash','[]',0,'now')"
            )
            raise RuntimeError("simulated process failure before commit")
    assert Store(store.path).list_imports() == []


def test_utf8_bom_and_row_limit(monkeypatch):
    assert parse_csv("orders", b"\xef\xbb\xbf" + ORDERS)[0]["order_id"] == "O1"
    monkeypatch.setattr("clearledger.ingest.MAX_ROWS", 1)
    with pytest.raises(LedgerError, match="records"):
        parse_csv("orders", ORDERS + b"O2,BRL,10,0\n")

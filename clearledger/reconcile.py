"""Pure reconciliation rules for an explicitly selected, complete settlement window."""

from collections import Counter, defaultdict

RULES_VERSION = "1"


def reconcile(orders: list[dict], transactions: list[dict], deposits: list[dict]) -> dict:
    orders_by_id = {row["order_id"]: row for row in orders}
    tx_by_order = defaultdict(list)
    tx_by_payout = defaultdict(list)
    bank_by_payout = defaultdict(list)
    totals = defaultdict(
        lambda: {
            "charged_minor": 0,
            "refunded_minor": 0,
            "fee_minor": 0,
            "net_minor": 0,
            "deposited_minor": 0,
        }
    )
    for tx in transactions:
        tx_by_order[tx["order_id"]].append(tx)
        tx_by_payout[tx["payout_id"]].append(tx)
        total = totals[tx["currency"]]
        if tx["kind"] == "charge":
            total["charged_minor"] += tx["gross_minor"]
        else:
            total["refunded_minor"] -= tx["gross_minor"]
        total["fee_minor"] += tx["fee_minor"]
        total["net_minor"] += tx["gross_minor"] - tx["fee_minor"]
    for deposit in deposits:
        bank_by_payout[deposit["payout_id"]].append(deposit)
        totals[deposit["currency"]]["deposited_minor"] += deposit["amount_minor"]

    order_results = []
    for order_id in sorted(orders_by_id.keys() | tx_by_order.keys()):
        order = orders_by_id.get(order_id)
        txs = tx_by_order[order_id]
        issues = []
        currency = order["currency"] if order else None
        comparable = [tx for tx in txs if tx["currency"] == currency]
        charged = sum(tx["gross_minor"] for tx in comparable if tx["kind"] == "charge")
        refunded = -sum(tx["gross_minor"] for tx in comparable if tx["kind"] == "refund")
        if not order:
            issues.append("unexpected_order")
        else:
            if any(tx["currency"] != currency for tx in txs):
                issues.append("currency_mismatch")
            if charged != order["expected_gross_minor"]:
                issues.append("missing_payment" if charged == 0 else "gross_mismatch")
            if refunded != order["expected_refund_minor"]:
                issues.append("refund_mismatch")
        order_results.append(
            {
                "order_id": order_id,
                "currency": currency,
                "observed_currencies": sorted({tx["currency"] for tx in txs}),
                "expected_gross_minor": order["expected_gross_minor"] if order else None,
                "actual_gross_minor": charged if order else None,
                "expected_refund_minor": order["expected_refund_minor"] if order else None,
                "actual_refund_minor": refunded if order else None,
                "transaction_ids": sorted(tx["transaction_id"] for tx in txs),
                "status": "attention" if issues else "matched",
                "issues": issues,
            }
        )

    payout_results = []
    for payout_id in sorted(tx_by_payout.keys() | bank_by_payout.keys()):
        txs, banks = tx_by_payout[payout_id], bank_by_payout[payout_id]
        expected, actual = defaultdict(int), defaultdict(int)
        for tx in txs:
            expected[tx["currency"]] += tx["gross_minor"] - tx["fee_minor"]
        for bank in banks:
            actual[bank["currency"]] += bank["amount_minor"]
        currencies = expected.keys() | actual.keys()
        issues = []
        if not txs:
            issues.append("missing_settlement")
        if not banks:
            issues.append("missing_deposit")
        if len(currencies) > 1:
            issues.append("currency_mismatch")
        delta = None
        if len(currencies) == 1 and txs and banks:
            currency = next(iter(currencies))
            delta = actual[currency] - expected[currency]
            if delta:
                issues.append("net_mismatch")
        payout_results.append(
            {
                "payout_id": payout_id,
                "expected_net_by_currency": dict(sorted(expected.items())),
                "deposited_by_currency": dict(sorted(actual.items())),
                "delta_minor": delta,
                "transaction_ids": sorted(tx["transaction_id"] for tx in txs),
                "deposit_ids": sorted(bank["deposit_id"] for bank in banks),
                "status": "attention" if issues else "matched",
                "issues": issues,
            }
        )
    all_results = order_results + payout_results
    issues = Counter(issue for row in all_results for issue in row["issues"])
    exceptions = sum(row["status"] == "attention" for row in all_results)
    return {
        "rules_version": RULES_VERSION,
        "status": "attention" if exceptions else "balanced",
        "summary": {
            "orders": len(order_results),
            "payouts": len(payout_results),
            "matched_orders": sum(row["status"] == "matched" for row in order_results),
            "matched_payouts": sum(row["status"] == "matched" for row in payout_results),
            "exceptions": exceptions,
            "issue_counts": dict(sorted(issues.items())),
        },
        "totals_by_currency": dict(sorted(totals.items())),
        "orders": order_results,
        "payouts": payout_results,
    }

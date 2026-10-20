import csv
import io
import json


def export_report(report: dict, output_format: str) -> str:
    if output_format == "json":
        return json.dumps(report, indent=2, sort_keys=True) + "\n"
    if output_format != "csv":
        raise ValueError("Unsupported export format")
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "type",
            "reference",
            "currency",
            "status",
            "issues",
            "expected_net_minor",
            "actual_net_minor",
            "delta_minor",
        ]
    )
    for order in report["orders"]:
        expected = actual = delta = None
        if order["currency"]:
            expected = order["expected_gross_minor"] - order["expected_refund_minor"]
            actual = order["actual_gross_minor"] - order["actual_refund_minor"]
            delta = actual - expected
        writer.writerow(
            [
                "order",
                order["order_id"],
                order["currency"],
                order["status"],
                "|".join(order["issues"]),
                expected,
                actual,
                delta,
            ]
        )
    for payout in report["payouts"]:
        currencies = sorted(
            payout["expected_net_by_currency"].keys() | payout["deposited_by_currency"].keys()
        )
        expected = actual = None
        if len(currencies) == 1:
            expected = payout["expected_net_by_currency"].get(currencies[0])
            actual = payout["deposited_by_currency"].get(currencies[0])
        writer.writerow(
            [
                "payout",
                payout["payout_id"],
                "|".join(currencies),
                payout["status"],
                "|".join(payout["issues"]),
                expected,
                actual,
                payout["delta_minor"],
            ]
        )
    return output.getvalue()

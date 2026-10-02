from datetime import date

from digest.bills import parse_bill_lines


def bill(text: str) -> dict:
    return {"id": 9, "file_name": "bill.pdf", "provider": "McCulloch", "authored_at": date(2024, 5, 27),
            "pages": [{"page": 1, "text": text}]}


def test_parses_amounts_with_commas_and_zero_lines():
    rows, unparsed = parse_bill_lines(bill(
        "Service date Service / documentation Charge\n"
        "07/26/2023 Left shoulder arthroscopy, surgeon fee only $7,800.00\n"
        "08/09/2023 Post-operative office follow-up, included in surgeon fee $0.00\n"))
    assert [(r["service_date"], r["amount_cents"]) for r in rows] == [(date(2023, 7, 26), 780000),
                                                                    (date(2023, 8, 9), 0)]
    assert rows[0]["description"] == "Left shoulder arthroscopy, surgeon fee only"
    assert unparsed == []


def test_reports_dated_lines_it_cannot_parse():
    # A charge line without an amount must be surfaced, not silently dropped from the totals.
    rows, unparsed = parse_bill_lines(bill("07/26/2023 Left shoulder arthroscopy\n"))
    assert rows == [] and len(unparsed) == 1

"""Itemized bills → one row per charge, so totals are computed in SQL instead of by an LLM."""
import re
from decimal import Decimal

from rag.parse import parse_us_date

BILL_LINE_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})\s+(.+?)\s+\$([\d,]+\.\d{2})$")
STARTS_WITH_DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}\b")


def parse_bill_lines(doc: dict) -> tuple[list[dict], list[str]]:
    """Returns (rows, unparsed lines that start with a date and therefore look like charges)."""
    rows, unparsed = [], []
    for page in doc["pages"]:
        for line in page["text"].splitlines():
            m = BILL_LINE_RE.match(line)
            if m:
                rows.append({
                    "document_id": doc["id"],
                    "provider": doc["provider"],
                    "statement_date": doc["authored_at"],
                    "service_date": parse_us_date(m.group(1)),
                    "description": m.group(2),
                    "amount": str(Decimal(m.group(3).replace(",", ""))),  # str keeps exact cents in JSON
                    "page_no": page["page"],
                })
            elif STARTS_WITH_DATE_RE.match(line):
                unparsed.append(f"{doc['file_name']} p{page['page']}: {line}")
    return rows, unparsed

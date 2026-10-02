"""Classify documents, extract their real dates, and strip per-page boilerplate.

Input: page records from data/pages.jsonl + Clio metadata from data/documents.json.
Output: one document dict per PDF with metadata and cleaned per-page text.
"""
import re
from datetime import date

MONTHS = ["january", "february", "march", "april", "may", "june", "july",
          "august", "september", "october", "november", "december"]
LONG_DATE_RE = re.compile(r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2}),?\s+(\d{4})\b", re.IGNORECASE)

# NYSCEF e-filing stamp printed at the top of every court-filed page.
STAMP_FILED_RE = re.compile(r"FILED:\s*NEW YORK COUNTY CLERK\s+(\d{1,2}/\d{1,2}/\d{4})")
STAMP_LINE_RE = re.compile(r"^\W*(FILED:|NYSCEF DOC\. NO\.|INDEX NO\.|RECEIVED NYSCEF)", re.IGNORECASE)
DATED_LINE_RE = re.compile(r"\bDated:(.{0,100})", re.IGNORECASE | re.DOTALL)

# Synthetic medical docs: repeated header/footer lines that carry metadata, not content.
SYNTH_HEADER_RE = re.compile(
    r"^(\W*SYNTHETIC HACKATHON SAMPLE|Patient:|DOB:|Accident date:|Visit date:|Statement date:|Male \||"
    r"Address at accident:|Financial advisor|Coverage history:|Fictional chart content|"
    r"Fictional hackathon charges|Matter \d+-|Page \d+ of \d+|.*\| DOB )"
)
SYNTH_FOOTER_RE = re.compile(r"^(Signature:|Unsigned synthetic sample|\$0 lines are included|Fictional chart content)")

DOC_TYPES = [  # (filename pattern, doc_type); first match wins
    (r"__doc-\d+__", "court_filing"),
    (r"^04-medical-records", "medical_record"),
    (r"^05-medical-bills", "medical_bill"),
    (r"^01-intake", "intake"),
]


def to_date(month: int, day: int, year: int) -> date | None:
    if year < 100:
        year += 2000
    try:
        return date(year, month, day)
    except ValueError:  # OCR noise such as 13/45/2023
        return None


def parse_us_date(s: str) -> date:
    month, day, year = (int(x) for x in s.split("/"))
    return to_date(month, day, year)


def classify(file_name: str) -> str:
    for pattern, doc_type in DOC_TYPES:
        if re.search(pattern, file_name):
            return doc_type
    return "other"


def title_from_filename(file_name: str) -> str:
    """'08-experts__doc-56__ime-orthopedic-hostin.pdf' → 'ime orthopedic hostin'."""
    slug = file_name.removesuffix(".pdf").split("__")[-1]
    slug = re.sub(r"-\d{4}-\d{2}-\d{2}$", "", slug)
    return slug.replace("-", " ")


def filename_date(file_name: str) -> date | None:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", file_name)
    return to_date(int(m.group(2)), int(m.group(3)), int(m.group(1))) if m else None


def nonblank_lines(text: str) -> list[str]:
    return [" ".join(line.split()) for line in text.splitlines() if line.strip()]


def strip_stamp(text: str) -> str:
    return "\n".join(line for line in nonblank_lines(text) if not STAMP_LINE_RE.match(line))


def long_date(m: re.Match) -> date | None:
    return to_date(MONTHS.index(m.group(1).lower()) + 1, int(m.group(2)), int(m.group(3)))


def dated_line_date(text: str) -> date | None:
    """NY pleadings are signed 'Dated: <city>, New York <Month D, YYYY>'; take the first one.
    (Other body dates are mostly past events: accident, surgery, earlier filings.)"""
    m = DATED_LINE_RE.search(text)
    if not m:
        return None
    d = LONG_DATE_RE.search(m.group(1))
    return long_date(d) if d else None


def split_synthetic_page(text: str) -> dict:
    """Split a synthetic medical page into provider, title, visit/statement date and clinical body."""
    lines = nonblank_lines(text)
    provider = lines[1] if len(lines) > 1 else None
    # Header = letterhead, then the title, then a consecutive block of patient lines.
    patient = next((i for i, l in enumerate(lines[:25]) if re.match(r"(Patient:|.*\| DOB )", l)), None)
    title = lines[patient - 1] if patient else None
    header_end = patient or 0
    while header_end < len(lines) and SYNTH_HEADER_RE.match(lines[header_end]):
        header_end += 1
    visit = re.search(r"Visit date:\s*(\d{2}/\d{2}/\d{4})", text)
    statement = re.search(r"Statement date:\s*(\d{2}/\d{2}/\d{4})", text)
    body = [l for l in lines[header_end:] if not (SYNTH_HEADER_RE.match(l) or SYNTH_FOOTER_RE.match(l))]
    # Handwritten (OCR) notes print the visit date alone on a line, then the title.
    lone_date = re.fullmatch(r"(?:Date:\s*)?(\d{2}/\d{2}/\d{4})", body[0]) if body else None
    if not visit and lone_date:
        visit_date = parse_us_date(lone_date.group(1))
        title, body = (body[1], body[2:]) if len(body) > 1 else (title, body[1:])
    else:
        visit_date = parse_us_date(visit.group(1)) if visit else None
    return {
        "provider": provider,
        "title": title,
        "visit_date": visit_date,
        "statement_date": parse_us_date(statement.group(1)) if statement else None,
        "body": "\n".join(body),
    }


def parse_document(clio: dict, pages: list[dict]) -> dict:
    """clio: the document as Clio returned it (raw_records.data); pages: doc_pages rows in order."""
    file_name = clio["name"]
    doc_type = classify(file_name)
    nyscef = re.search(r"__doc-(\d+)__", file_name)
    doc = {
        "id": clio["id"],
        "file_name": file_name,
        "stage": (clio.get("parent") or {}).get("name"),
        "doc_type": doc_type,
        "title": title_from_filename(file_name),
        "provider": None,
        "nyscef_no": int(nyscef.group(1)) if nyscef else None,
        "filed_at": None,
        "authored_at": None,
        "page_count": len(pages),
        "pages": [],  # [{page, method, text, visit_date?, title?}] with boilerplate removed
    }

    # doc_date = the one date the timeline uses; date_source says where it came from.
    doc["doc_date"], doc["date_source"] = None, None
    if doc_type in ("medical_record", "medical_bill", "intake"):
        for p in pages:
            s = split_synthetic_page(p["text"])
            doc["pages"].append({"page": p["page"], "method": p["method"], "text": s["body"],
                                 "visit_date": s["visit_date"], "title": s["title"]})
            doc["provider"] = doc["provider"] or s["provider"]
            doc["authored_at"] = doc["authored_at"] or s["statement_date"]
        if doc_type == "medical_record":
            visits = [p["visit_date"] for p in doc["pages"] if p["visit_date"]]
            if visits:
                doc["doc_date"], doc["date_source"] = min(visits), "first_visit"
        elif doc_type == "medical_bill" and doc["authored_at"]:
            doc["doc_date"], doc["date_source"] = doc["authored_at"], "statement_date"
        if doc_type == "intake":
            doc["provider"] = None
    else:
        text = "\n".join(p["text"] for p in pages)
        stamp = STAMP_FILED_RE.search(text)
        doc["filed_at"] = parse_us_date(stamp.group(1)) if stamp else None
        doc["pages"] = [{"page": p["page"], "method": p["method"], "text": strip_stamp(p["text"])} for p in pages]
        doc["authored_at"] = dated_line_date(text)
        authored_source = "dated_line"
        if not doc["authored_at"]:  # letters carry their date at the top of page 1
            first = LONG_DATE_RE.search(doc["pages"][0]["text"])
            doc["authored_at"], authored_source = (long_date(first) if first else None), "letter_date"
        # For filings the procedural event is the filing itself, so the stamp wins.
        if doc["filed_at"]:
            doc["doc_date"], doc["date_source"] = doc["filed_at"], "nyscef_stamp"
        elif doc["authored_at"]:
            doc["doc_date"], doc["date_source"] = doc["authored_at"], authored_source

    if not doc["doc_date"] and (fd := filename_date(file_name)):
        doc["doc_date"], doc["date_source"] = fd, "filename"
    return doc

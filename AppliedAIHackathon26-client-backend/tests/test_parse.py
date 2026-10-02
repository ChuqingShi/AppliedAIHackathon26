from datetime import date

from digest.parse import classify, dated_line_date, parse_document, split_synthetic_page

def clio(name: str) -> dict:
    return {"id": 1, "name": name, "parent": {"name": "02 Pleadings"}}


def test_classify_by_filename():
    assert classify("08-experts__doc-56__ime-orthopedic-hostin.pdf") == "court_filing"
    assert classify("04-medical-records__created__peter-kwan-neurology-records-2023-05-31.pdf") == "medical_record"
    assert classify("05-medical-bills__created__peter-kwan-neurology-itemized-bill-2023-12-12.pdf") == "medical_bill"
    assert classify("01-intake__created__photo-id.pdf") == "intake"


def test_court_filing_uses_stamp_not_body_event_dates():
    # The body mentions the accident date first; the timeline date must still be the filing stamp.
    page = ("FILED: NEW YORK COUNTY CLERK 01/02/2025 03:05 PM INDEX NO. 160000/2024\n"
            "NYSCEF DOC. NO. 7 RECEIVED NYSCEF: 01/02/2025\n"
            "On April 23, 2023 plaintiff was injured.\n"
            "Dated: White Plains, New York\nJanuary 2, 2025\n")
    doc = parse_document(clio("02-pleadings__doc-07__bill-of-particulars.pdf"),
                         [{"page": 1, "method": "text_layer", "text": page}])
    assert doc["filed_at"] == date(2025, 1, 2)
    assert doc["authored_at"] == date(2025, 1, 2)
    assert (doc["doc_date"], doc["date_source"]) == (date(2025, 1, 2), "nyscef_stamp")
    assert "FILED:" not in doc["pages"][0]["text"]  # stamp stripped from the page text


def test_letter_without_stamp_uses_letter_date():
    page = "STOLZENBERG CORTELLI\nApril 16, 2025\nHonorable Christopher Chin\nRe: Sapini v. Ferrara\n"
    doc = parse_document(clio("06-correspondence__doc-12__letter-to-judge.pdf"),
                         [{"page": 1, "method": "ocr", "text": page}])
    assert (doc["doc_date"], doc["date_source"]) == (date(2025, 4, 16), "letter_date")


def test_dated_line_tolerates_ocr_noise():
    assert dated_line_date("Dated: White Plains, New York / yy fy J, October 15, 2024 / /") == date(2024, 10, 15)


def test_synthetic_page_header_becomes_metadata():
    page = ("SYNTHETIC HACKATHON SAMPLE | NOT AN AUTHENTIC RECORD OR BILL\n"
            "McCulloch Orthopaedic Surgical Services, PLLC\n3225 Westchester Avenue, Bronx, NY 10451\n"
            "Shoulder MRI review and follow-up\nPatient: Justin W. Sapini DOB: 12/21/1995\n"
            "Accident date: 04/23/2023 Visit date: 06/07/2023\nCoverage history: Progressive no-fault\n"
            "HISTORY\nPersistent left shoulder pain.\n"
            "Fictional chart content for testing. Not for treatment.\n")
    s = split_synthetic_page(page)
    assert s["provider"] == "McCulloch Orthopaedic Surgical Services, PLLC"
    assert s["title"] == "Shoulder MRI review and follow-up"
    assert s["visit_date"] == date(2023, 6, 7)
    assert s["body"] == "HISTORY\nPersistent left shoulder pain."

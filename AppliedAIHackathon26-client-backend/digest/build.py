"""Turn synced documents into facts: page text, real dates, recovery status, bill lines.

Usage (from the backend folder, after `python sync.py ...`):
    python -m digest            # only documents that changed since the last run
    python -m digest --force    # rebuild everything (e.g. after changing a rule)
"""
import argparse
import json

from db import connect
from digest import ensure_schema
from digest.bills import parse_bill_lines
from digest.extract import extract_pending
from digest.medical import LABELS, expert_evidence, visits
from digest.parse import parse_document

FACT_TABLES = ("doc_meta", "medical_visits", "recovery_evidence", "bill_lines")
EXPERT_STAGE = "08 Experts"


def money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def summary_line(doc: dict, visit_rows: list[dict], evidence: list[dict], bill_rows: list[dict]) -> str:
    """One readable line per document, built from the extracted facts."""
    if doc["doc_type"] == "medical_record" and visit_rows:
        dated = sorted((v for v in visit_rows if v["visit_date"]), key=lambda v: (v["visit_date"], v["page"]))
        last = dated[-1] if dated else visit_rows[-1]
        span = f"{dated[0]['visit_date']} – {last['visit_date']}" if dated else "undated"
        status = f"impression: {last['evidence']}" if last["recovery"] == "diagnostic" else f"last status: {LABELS[last['recovery']]}"
        return f"{len(visit_rows)} visits {span} · {status}"
    if doc["doc_type"] == "medical_bill" and bill_rows:
        return f"{len(bill_rows)} charges · {money(sum(r['amount_cents'] for r in bill_rows))}"
    if evidence:
        found = sorted({LABELS[e["recovery"]] for e in evidence})
        return f"{(evidence[0]['side'] or 'unknown').capitalize()} expert {evidence[0]['author']} · " + ", ".join(found)
    if doc["nyscef_no"]:
        return f"NYSCEF #{doc['nyscef_no']}" + (f" · filed {doc['filed_at']}" if doc["filed_at"] else "")
    return doc["title"]


def digest_document(conn, row, force: bool) -> bool:
    """Rebuild one document's facts if its file changed. Returns True if it was (re)built."""
    built = conn.execute("SELECT hash FROM doc_meta WHERE doc_id=?", (row["doc_id"],)).fetchone()
    if built and built["hash"] == row["hash"] and not force:
        return False
    pages = [dict(p) for p in conn.execute(
        "SELECT page, method, text FROM doc_pages WHERE doc_id=? ORDER BY page", (row["doc_id"],))]
    doc = json.loads(json.dumps(parse_document(json.loads(row["data"]), pages), default=str))  # dates → ISO

    visit_rows = visits(doc) if doc["doc_type"] == "medical_record" else []
    evidence = expert_evidence(doc) if doc["stage"] == EXPERT_STAGE else []
    bill_rows, unparsed = parse_bill_lines(doc) if doc["doc_type"] == "medical_bill" else ([], [])
    for line in unparsed:
        print(f"  WARNING unparsed bill line: {line}")

    for table in FACT_TABLES:
        conn.execute(f"DELETE FROM {table} WHERE doc_id=?", (row["doc_id"],))
    conn.execute(
        """INSERT INTO doc_meta(doc_id, matter_id, hash, doc_type, stage, title, provider, nyscef_no,
                                filed_at, authored_at, doc_date, date_source, summary)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (row["doc_id"], row["matter_id"], row["hash"], doc["doc_type"], doc["stage"], doc["title"], doc["provider"],
         doc["nyscef_no"], doc["filed_at"], doc["authored_at"], doc["doc_date"], doc["date_source"],
         summary_line(doc, visit_rows, evidence, bill_rows)))
    conn.executemany(
        """INSERT INTO medical_visits(doc_id, page, provider, visit_date, title, work_status, recovery, evidence)
           VALUES (:doc_id, :page, :provider, :visit_date, :title, :work_status, :recovery, :evidence)""", visit_rows)
    conn.executemany(
        """INSERT INTO recovery_evidence(doc_id, page, author, side, recovery, quote, doc_date)
           VALUES (:doc_id, :page, :author, :side, :recovery, :quote, :doc_date)""", evidence)
    conn.executemany(
        """INSERT INTO bill_lines(doc_id, page, provider, statement_date, service_date, description, amount_cents)
           VALUES (:doc_id, :page, :provider, :statement_date, :service_date, :description, :amount_cents)""", bill_rows)
    conn.commit()
    return True


def digest(force: bool = False) -> dict:
    conn = connect()
    ensure_schema(conn)
    extracted = extract_pending(conn)
    rows = conn.execute(
        """SELECT f.doc_id, f.hash, r.matter_id, r.data FROM doc_files f
           JOIN raw_records r ON r.kind='document' AND r.clio_id=f.doc_id
           WHERE f.pages IS NOT NULL""").fetchall()
    built = sum(digest_document(conn, row, force) for row in rows)
    counts = {t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in FACT_TABLES}
    print(f"extracted {extracted} documents, digested {built} of {len(rows)}; totals: {counts}")
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="Rule-based digest of synced documents")
    ap.add_argument("--force", action="store_true", help="rebuild every document, not only changed ones")
    digest(force=ap.parse_args().force)

"""Read side of the digest: what the API and case_view serve. Never calls Clio."""
from db import connect
from digest import ensure_schema
from digest.medical import LABELS

# Treating providers' categories in "how recovered" order, for the headline.
TREATING = ("resolved", "discharged", "plateau", "improving", "not_recovered", "unknown")


def _rows(conn, sql: str, args=()) -> list[dict]:
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def _matter(conn, matter_id: int | None) -> int:
    """Same default as case_view: the most recently synced matter."""
    if matter_id is not None:
        return matter_id
    row = conn.execute("SELECT matter_id FROM raw_records WHERE kind='matter' ORDER BY changed_at DESC LIMIT 1").fetchone()
    if not row:
        raise LookupError("No matter has been synced yet. Run: python sync.py <matter_id>")
    return row["matter_id"]


def recovery(matter_id: int | None = None) -> dict:
    """Latest status per treating provider and every expert conclusion, each with its evidence."""
    with connect() as conn:
        ensure_schema(conn)
        matter_id = _matter(conn, matter_id)
        # Latest dated visit per provider (window function: one row per provider).
        providers = _rows(conn, """
            SELECT provider, visits, first_visit, visit_date AS last_visit, recovery, work_status, evidence,
                   doc_id, page
            FROM (SELECT v.*, count(*) OVER w AS visits, min(v.visit_date) OVER w AS first_visit,
                         row_number() OVER (PARTITION BY v.provider ORDER BY v.visit_date DESC, v.page DESC) AS rn
                  FROM medical_visits v JOIN doc_meta d ON d.doc_id = v.doc_id
                  WHERE d.matter_id = ? AND v.visit_date IS NOT NULL
                  WINDOW w AS (PARTITION BY v.provider))
            WHERE rn = 1 ORDER BY last_visit DESC""", (matter_id,))
        experts = _rows(conn, """
            SELECT e.author, e.side, e.recovery, e.quote, e.doc_id, e.page, e.doc_date
            FROM recovery_evidence e JOIN doc_meta d ON d.doc_id = e.doc_id
            WHERE d.matter_id = ? ORDER BY e.doc_date DESC, e.page""", (matter_id,))
    for p in providers + experts:
        p["label"] = LABELS[p["recovery"]]

    treating = [p for p in providers if p["recovery"] in TREATING]
    headline = []
    if treating:
        t = treating[0]  # most recent treating visit
        headline.append(f"{t['provider']} (last visit {t['last_visit']}): {t['label']}")
    for author in dict.fromkeys(e["author"] for e in experts):
        mine = [e for e in experts if e["author"] == author]
        found = ", ".join(dict.fromkeys(e["label"] for e in mine))
        headline.append(f"{mine[0]['side'].capitalize() if mine[0]['side'] else 'Unknown'} expert {author} "
                        f"({mine[0]['doc_date']}): {found}")
    return {"matterId": matter_id, "headline": headline, "providers": providers, "experts": experts}


def bills(matter_id: int | None = None) -> dict:
    """Charge lines and per-provider totals, summed exactly in integer cents."""
    with connect() as conn:
        ensure_schema(conn)
        matter_id = _matter(conn, matter_id)
        totals = _rows(conn, """
            SELECT b.provider, count(*) AS lines, sum(b.amount_cents) AS total_cents,
                   min(b.service_date) AS first_service, max(b.service_date) AS last_service, b.doc_id
            FROM bill_lines b JOIN doc_meta d ON d.doc_id = b.doc_id
            WHERE d.matter_id = ? GROUP BY b.provider, b.doc_id ORDER BY total_cents DESC""", (matter_id,))
        lines = _rows(conn, """
            SELECT b.provider, b.service_date, b.description, b.amount_cents, b.doc_id, b.page
            FROM bill_lines b JOIN doc_meta d ON d.doc_id = b.doc_id
            WHERE d.matter_id = ? ORDER BY b.service_date, b.provider""", (matter_id,))
    return {"matterId": matter_id, "totalCents": sum(t["total_cents"] for t in totals),
            "providers": totals, "lines": lines}


def timeline(matter_id: int | None = None) -> list[dict]:
    """Documents ordered by their real date (not Clio's upload time)."""
    with connect() as conn:
        ensure_schema(conn)
        matter_id = _matter(conn, matter_id)
        return _rows(conn, """
            SELECT doc_id, title, doc_type, stage, nyscef_no, doc_date, date_source, summary
            FROM doc_meta WHERE matter_id = ? ORDER BY doc_date IS NULL, doc_date DESC""", (matter_id,))


def document_facts(matter_id: int) -> dict[int, dict]:
    """doc_id → {docDate, summary}, for the documents list in GET /case."""
    with connect() as conn:
        ensure_schema(conn)
        return {r["doc_id"]: {"docDate": r["doc_date"], "summary": r["summary"]} for r in conn.execute(
            "SELECT doc_id, doc_date, summary FROM doc_meta WHERE matter_id = ?", (matter_id,))}

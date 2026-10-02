"""Rule-based document digest on top of the Clio sync (no LLM, no vector search).

    doc_files ──extract──▶ doc_pages ──digest──▶ doc_meta, medical_visits, recovery_evidence, bill_lines
                                                        │
                                              queries ──▶ /case/recovery, /case/bills, /case/timeline

Run from the backend folder after `python sync.py ...`:  python -m digest
"""
from pathlib import Path

SCHEMA = (Path(__file__).parent / "schema.sql").read_text()


def ensure_schema(conn) -> None:
    """Create the digest's own tables next to the sync tables (db.py stays untouched)."""
    conn.executescript(SCHEMA)

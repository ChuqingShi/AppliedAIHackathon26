"""Embed chunks and (re)load documents, chunks and bill_lines into Postgres. Idempotent.

Run: uv run python -m rag.load
"""
import os
from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector

from rag import DATA, read_jsonl
from rag.embed import embed_documents

DOC_COLS = ["id", "file_name", "matter", "stage", "doc_type", "title", "provider", "nyscef_no", "filed_at",
            "authored_at", "doc_date", "date_source", "page_count", "clio_uploaded_at"]
CHUNK_COLS = ["id", "document_id", "parent_id", "chunk_type", "section", "page_start", "page_end",
              "event_date", "mentioned_dates", "context_header", "text", "embedding"]
BILL_COLS = ["document_id", "provider", "statement_date", "service_date", "description", "amount", "page_no"]


def connect() -> psycopg.Connection:
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute((Path(__file__).parent / "schema.sql").read_text())
    register_vector(conn)  # after the extension exists
    return conn


def insert(cur, table: str, cols: list[str], rows: list[dict]) -> None:
    sql = f"insert into {table} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))})"
    cur.executemany(sql, [[row.get(c) for c in cols] for row in rows])


def main() -> None:
    documents = read_jsonl(DATA / "documents_parsed.jsonl")
    chunks = read_jsonl(DATA / "chunks.jsonl")
    bill_lines = read_jsonl(DATA / "bill_lines.jsonl")

    to_embed = [c for c in chunks if c["embed"]]
    vectors = embed_documents([f"{c['context_header']}\n{c['text']}" for c in to_embed])
    for c, v in zip(to_embed, vectors):
        c["embedding"] = v

    # Parents must exist before children reference them.
    chunks.sort(key=lambda c: c["parent_id"] is not None)
    with connect() as conn, conn.cursor() as cur:
        cur.execute("truncate documents, chunks, bill_lines restart identity cascade")
        insert(cur, "documents", DOC_COLS, documents)
        insert(cur, "chunks", CHUNK_COLS, chunks)
        insert(cur, "bill_lines", BILL_COLS, bill_lines)
    print(f"loaded {len(documents)} documents, {len(chunks)} chunks ({len(to_embed)} embedded), "
          f"{len(bill_lines)} bill lines")


if __name__ == "__main__":
    main()

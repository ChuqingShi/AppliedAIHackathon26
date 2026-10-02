"""data/pages.jsonl → parsed documents, chunks and bill rows. Cheap to re-run (no OCR).

Run: uv run python -m rag.build
"""
import json
from collections import Counter, defaultdict

from rag import DATA, read_jsonl, write_jsonl
from rag.bills import parse_bill_lines
from rag.chunk import chunk_document
from rag.parse import parse_document


def to_json_ready(row: dict) -> dict:
    """Dates → ISO strings so the jsonl files are plain JSON."""
    return json.loads(json.dumps(row, default=str))


def main() -> None:
    pages = defaultdict(list)
    for p in read_jsonl(DATA / "pages.jsonl"):
        pages[p["file"]].append(p)
    clio = {d["name"]: d for d in json.loads((DATA / "documents.json").read_text())}

    documents, chunks, bill_lines, unparsed = [], [], [], []
    for file_name in sorted(pages):
        doc = parse_document(file_name, pages[file_name], clio[file_name])
        rows = []
        if doc["doc_type"] == "medical_bill":
            rows, bad = parse_bill_lines(doc)
            bill_lines += rows
            unparsed += bad
        chunks += chunk_document(doc, rows)
        documents.append({k: v for k, v in doc.items() if k != "pages"})

    write_jsonl(DATA / "documents_parsed.jsonl", [to_json_ready(d) for d in documents])
    write_jsonl(DATA / "chunks.jsonl", [to_json_ready(c) for c in chunks])
    write_jsonl(DATA / "bill_lines.jsonl", [to_json_ready(r) for r in bill_lines])

    print(f"{len(documents)} documents, {len(bill_lines)} bill lines")
    print("chunks:", dict(Counter(c["chunk_type"] for c in chunks)))
    if unparsed:
        print(f"WARNING {len(unparsed)} unparsed bill lines:", *unparsed[:5], sep="\n  ")


if __name__ == "__main__":
    main()

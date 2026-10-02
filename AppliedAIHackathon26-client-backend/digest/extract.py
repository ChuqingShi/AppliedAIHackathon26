"""doc_files → doc_pages: one row per page, from the PDF text layer or tesseract OCR.

Only documents with doc_files.pages IS NULL are processed. sync.py writes doc_files with
INSERT OR REPLACE whenever it (re)downloads a file, which resets `pages` to NULL, so a
changed document is picked up again automatically.
"""
import subprocess
import tempfile
from pathlib import Path

import pymupdf

MIN_TEXT_CHARS = 100  # fewer non-space chars than this → treat the page as a scan
OCR_DPI = 300


def ocr_page(page: pymupdf.Page) -> str:
    pix = page.get_pixmap(dpi=OCR_DPI, colorspace=pymupdf.csGRAY)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "page.png"
        pix.save(png)
        result = subprocess.run(["tesseract", str(png), "-"], capture_output=True, text=True, check=True)
    return result.stdout


def extract_pdf(path: Path) -> list[dict]:
    pages = []
    with pymupdf.open(path) as pdf:
        for i, page in enumerate(pdf, start=1):
            text = page.get_text(sort=True)  # sorted: table rows stay on one line
            method = "text_layer"
            if len("".join(text.split())) < MIN_TEXT_CHARS:
                text = ocr_page(page)
                method = "ocr"
            pages.append({"page": i, "method": method, "text": text})
    return pages


def extract_pending(conn) -> int:
    """Fill doc_pages for every downloaded document that has no pages yet. Returns how many."""
    pending = conn.execute("SELECT doc_id, path FROM doc_files WHERE pages IS NULL").fetchall()
    for row in pending:
        path = Path(row["path"])
        pages = extract_pdf(path) if path.suffix.lower() == ".pdf" and path.is_file() else []
        conn.execute("DELETE FROM doc_pages WHERE doc_id=?", (row["doc_id"],))
        conn.executemany("INSERT INTO doc_pages(doc_id, page, text, method) VALUES (?,?,?,?)",
                         [(row["doc_id"], p["page"], p["text"], p["method"]) for p in pages])
        conn.execute("UPDATE doc_files SET pages=? WHERE doc_id=?", (len(pages), row["doc_id"]))
        conn.commit()
        ocr = sum(p["method"] == "ocr" for p in pages)
        print(f"  {len(pages):4d} pages ({ocr} OCR)  {path.name}")
    return len(pending)

"""PDF → one record per page, using the text layer when present and tesseract OCR otherwise.

Run: uv run python -m rag.extract
"""
import subprocess
import tempfile
from pathlib import Path

import pymupdf

from rag import DATA, RAW, write_jsonl

MIN_TEXT_CHARS = 100  # fewer non-space chars than this → treat the page as a scan
OCR_DPI = 300
# Files whose existing OCR layer is too poor to trust; re-OCR them (decide via retrieval eval).
FORCE_OCR: set[str] = set()


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
            text = page.get_text(sort=True)
            method = "text"
            if path.name in FORCE_OCR or len("".join(text.split())) < MIN_TEXT_CHARS:
                text = ocr_page(page)
                method = "ocr"
            pages.append({"file": path.name, "page": i, "method": method, "text": text})
    return pages


def main() -> None:
    rows = []
    for path in sorted(RAW.glob("*.pdf")):
        pages = extract_pdf(path)
        ocr = sum(p["method"] == "ocr" for p in pages)
        print(f"{len(pages):4d} pages ({ocr} OCR)  {path.name}")
        rows += pages
    write_jsonl(DATA / "pages.jsonl", rows)
    print(f"{len(rows)} pages → data/pages.jsonl")


if __name__ == "__main__":
    main()

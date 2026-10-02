import pymupdf

import db
from digest.extract import extract_pending


def test_fills_doc_pages_and_marks_the_file_done(tmp_path, monkeypatch):
    pdf = tmp_path / "1__letter.pdf"
    doc = pymupdf.open()
    doc.new_page().insert_textbox(pymupdf.Rect(72, 72, 540, 400),
                                  "Dear Judge Chin, we request a preliminary conference date. " * 3)
    doc.save(pdf)

    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    conn = db.connect()
    conn.execute("INSERT INTO doc_files(doc_id, path, hash) VALUES (1, ?, 'h1')", (str(pdf),))

    assert extract_pending(conn) == 1
    page = conn.execute("SELECT page, method, text FROM doc_pages WHERE doc_id=1").fetchone()
    assert (page["page"], page["method"]) == (1, "text_layer")
    assert "preliminary conference" in page["text"]
    assert conn.execute("SELECT pages FROM doc_files WHERE doc_id=1").fetchone()["pages"] == 1
    # Already extracted: a second run does nothing until sync resets `pages` to NULL.
    assert extract_pending(conn) == 0

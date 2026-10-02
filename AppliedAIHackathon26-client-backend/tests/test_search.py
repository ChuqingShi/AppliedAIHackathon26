import json

import pytest

import db
from digest import ensure_schema
from digest.search import match_query, search

NOW = "2026-01-01T00:00:00"


def test_match_query_keeps_the_meaningful_words():
    assert match_query("What did the MRI show?") == '"mri"'
    assert match_query("How much was the surgical center bill?") == '"surgical" OR "center" OR "bill"'
    # No closing punctuation: the last word is still being typed, so it matches as a prefix.
    assert match_query("shoulder arthro") == '"shoulder" OR "arthro"*'
    assert match_query("what is it?") is None


@pytest.fixture
def conn(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    conn = db.connect()
    records = [("matter", 7, {"id": 7}),
               ("document", 1, {"id": 1, "name": "04-medical-records__created__hudson-valley-radiology-records-2023-05-08.pdf"}),
               ("document", 2, {"id": 2, "name": "06-correspondence__doc-12__letter-to-judge.pdf"})]
    conn.executemany(
        "INSERT INTO raw_records(kind, clio_id, matter_id, data, hash, synced_at, changed_at) VALUES (?,?,7,?,'h',?,?)",
        [(kind, clio_id, json.dumps(data), NOW, NOW) for kind, clio_id, data in records])
    conn.commit()
    return conn


def add_pages(conn, pages):
    conn.executemany("INSERT INTO doc_pages(doc_id, page, text, method) VALUES (?,?,?,'text_layer')", pages)
    conn.commit()


def test_finds_the_page_and_names_its_document(conn):
    ensure_schema(conn)
    add_pages(conn, [(1, 1, "Chest radiograph. No acute findings."),
                     (1, 2, "MRI of the left shoulder. Impression: full-thickness supraspinatus tear."),
                     (2, 1, "Dear Judge Chin, we request a preliminary conference date.")])

    hits = search("What did the MRI of the shoulder show?")
    assert (hits[0]["docId"], hits[0]["page"], hits[0]["name"]) == (1, 2, "Hudson valley radiology records")
    assert "**MRI**" in hits[0]["snippet"] and "text" not in hits[0]
    assert "supraspinatus" in search("mri", full=True)[0]["text"]
    assert search("shoulder mri?", full=True)[0]["complete"] and not search("shoulder x-ray?", full=True)[0]["complete"]
    # The snippet starts where the question's words come closest together.
    assert hits[0]["snippet"].startswith("**MRI** of the left **shoulder**")
    # A document's name counts too, and stemming matches "tears" to "tear".
    assert search("letter to the judge")[0]["docId"] == 2
    assert search("tears")[0]["page"] == 2
    assert search("anything about a deposition?") == []


def test_ranks_by_how_many_of_the_words_a_page_has_and_how_close_together(conn):
    ensure_schema(conn)
    add_pages(conn, [(1, 1, "MRI lumbar spine. MRI cervical spine. MRI knee. MRI ankle. The shoulder was not imaged; left for later."),
                     (1, 2, "Left shoulder MRI: partial tear of the posterior inferior labrum."),
                     (1, 3, "Left knee pain.")])
    assert [h["page"] for h in search("left shoulder MRI findings?")] == [2, 1, 3]


def test_index_follows_doc_pages(conn):
    # Pages extracted before the index existed are picked up when it is created...
    add_pages(conn, [(2, 1, "Dear Judge Chin, we request a preliminary conference date.")])
    assert [h["docId"] for h in search("preliminary conference")] == [2]
    # ...and re-extracting a document replaces its pages in the index.
    conn.execute("DELETE FROM doc_pages WHERE doc_id=2")
    add_pages(conn, [(2, 1, "Dear Judge Chin, we request an adjournment.")])
    assert search("preliminary conference") == []
    assert [h["page"] for h in search("adjournment")] == [1]

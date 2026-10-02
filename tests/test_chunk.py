from datetime import date

from rag.chunk import chunk_court_filing, is_heading
from rag.embed import MAX_TOKENS, count_tokens

DOC = {"id": 5, "doc_type": "court_filing", "nyscef_no": 5, "title": "verified answer demands",
       "provider": None, "filed_at": date(2024, 12, 2), "doc_date": date(2024, 12, 2), "page_count": 2}


def test_heading_detection_skips_caption_names_and_caps_lists():
    assert is_heading("AS AND FOR A FIRST AFFIRMATIVE DEFENSE:", "8. That whatever injuries")
    assert not is_heading("STOLZENBERG CORTELLI, LLP", "Attorneys for Plaintiff")
    assert not is_heading("LEFT SHOULDER", "TEAR OF THE POSTERIOR LABRUM")  # followed by more caps


def test_court_chunks_respect_model_limit_and_link_parents():
    long_para = "8. " + "The plaintiff's injuries were caused by his own negligence. " * 120
    doc = {**DOC, "pages": [
        {"page": 1, "text": "AS AND FOR A FIRST AFFIRMATIVE DEFENSE:\n" + long_para},
        {"page": 2, "text": "9. Assumption of risk.\n10. Failure to mitigate."},
    ]}
    chunks = chunk_court_filing(doc)
    passages = [c for c in chunks if c["chunk_type"] == "passage"]
    parent_ids = {c["id"] for c in chunks if c["chunk_type"] == "section"}

    assert len(passages) > 1  # the oversized paragraph was split
    assert all(count_tokens(f"{c['context_header']}\n{c['text']}") <= MAX_TOKENS for c in passages)
    assert all(c["parent_id"] in parent_ids for c in passages)
    assert passages[0]["context_header"].startswith("[Court filing · NYSCEF #5 · verified answer demands")

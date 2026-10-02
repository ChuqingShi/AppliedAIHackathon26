"""Full-text search over the pages of the synced documents (SQLite FTS5 ranked by BM25; no LLM, no vectors).

The dashboard's search box asks this for the pages that answer a question. Each hit names
its document and page, so the passage can be shown and the PDF opened at that page.
"""
import os
import re

from case_view import clean_doc_name
from db import connect
from digest import ensure_schema
from digest.parse import STAMP_LINE_RE, SYNTH_FOOTER_RE, SYNTH_HEADER_RE, nonblank_lines
from digest.queries import _matter

# Words a question is asked with, which say nothing about what to look for.
STOPWORDS = frozenset("""a about all an and any are as at be been by can could did do does for from had has have how
    i in is it its many me much my of on or our said say says show shows tell that the their there these this to
    was we were what when where which who whom why will with would you""".split())
PER_DOC = 3         # pages listed from one document, so a long chart doesn't crowd out the rest
SNIPPET_WORDS = 36
LEAD_IN = 2         # words shown before the first matched word of a snippet
# A question about money is answered by a bill; any other is not, however often a bill names the treatment.
MONEY_RE = re.compile(r"\b(bill|charg|cost|how much|amount|owe|price|invoice|paid|pay)", re.I)
BILL_WEIGHT = {True: 2.0, False: 0.4}


def terms(question: str) -> list[str]:
    """The meaningful words of a question, in the order asked."""
    raw = re.findall(r"[a-z0-9]+", question.lower())
    return list(dict.fromkeys(w for w in raw if w not in STOPWORDS and (len(w) > 1 or w.isdigit())))


def match_query(question: str) -> str | None:
    """The FTS5 query for a question: its meaningful words, any of which may match. A last
    word that is still being typed matches as a prefix. None when nothing meaningful is left."""
    words = terms(question)
    if not words:
        return None
    quoted = [f'"{w}"' for w in words]
    if question[-1:].isalnum() and question.lower().endswith(words[-1]):
        quoted[-1] += "*"
    return " OR ".join(quoted)


def which_term(word: str, words: list[str]) -> str:
    """The question's word that a matched word of the page stands for ("MRIs" for "mri"):
    the one it shares the longest beginning with."""
    w = re.sub(r"[^a-z0-9]", "", word.lower())
    return max(words, key=lambda t: len(os.path.commonprefix([t, w])))


def passage(marked: str, words: list[str]) -> tuple[str, set[str], float]:
    """Where on a page the question's words come closest together. `marked` is the page's text
    with each matched word in **bold** marks, as FTS5's highlight() returns it. Returns the
    snippet that starts there, the question's words found on the page, and how many words of
    the page it takes to hold them all (the fewer, the more likely the page is about them)."""
    lines = (l for l in nonblank_lines(marked) if not any(
        boilerplate.match(l.replace("**", "")) for boilerplate in (STAMP_LINE_RE, SYNTH_HEADER_RE, SYNTH_FOOTER_RE)))
    text = " ".join(lines).split()
    hits = [(i, which_term(w, words)) for i, w in enumerate(text) if "**" in w]
    found = {t for _, t in hits}
    start, span = 0, float("inf")  # a page found by its document's name alone comes after those that say the words
    if hits:
        # The shortest stretch holding every word found; the earliest of them if several are as short.
        span, start = min((j - i + 1, i) for n, (i, _) in enumerate(hits)
                          for j in [next((j for j, _ in hits[n:] if {t for k, t in hits[n:] if k <= j} == found), None)]
                          if j is not None)
    start = max(start - LEAD_IN, 0)
    snippet = ("…" if start else "") + " ".join(text[start:start + SNIPPET_WORDS]) + ("…" if start + SNIPPET_WORDS < len(text) else "")
    return snippet, found, span


def search(question: str, matter_id: int | None = None, limit: int = 8, full: bool = False) -> list[dict]:
    """The pages that best match a question, best first: [{docId, name, page, snippet}]. The
    snippet marks the matched words in **bold**. full=True is for the assistant to read: it
    adds each page's text and lets one document fill the list.

    FTS5 finds the candidates by BM25. They are then put in order by how many of the question's
    words the page (or its document's name) has, then how close together it has them, then BM25."""
    query = match_query(question)
    if not query:
        return []
    words = terms(question)
    with connect() as conn:
        ensure_schema(conn)
        matter_id = _matter(conn, matter_id)
        rows = conn.execute("""
            SELECT f.doc_id, f.page, f.name, f.text, m.doc_type, bm25(doc_pages_fts, 4.0, 1.0) AS score,
                   highlight(doc_pages_fts, 0, '**', '**') AS marked_name,
                   highlight(doc_pages_fts, 1, '**', '**') AS marked
            FROM doc_pages_fts f JOIN raw_records r ON r.kind = 'document' AND r.clio_id = f.doc_id
                 LEFT JOIN doc_meta m ON m.doc_id = f.doc_id
            WHERE doc_pages_fts MATCH ? AND r.matter_id = ?
            ORDER BY score LIMIT 100""", (query, matter_id)).fetchall()
    about_money = bool(MONEY_RE.search(question))
    ranked = []
    for r in rows:
        snippet, found, span = passage(r["marked"] or "", words)
        in_name = {which_term(w, words) for w in re.findall(r"\*\*(.+?)\*\*", r["marked_name"] or "")}
        score = r["score"] * (BILL_WEIGHT[about_money] if r["doc_type"] == "medical_bill" else 1)  # lower is better
        ranked.append((-len(found | in_name), span, score, r, snippet))
    ranked.sort(key=lambda x: x[:3])
    hits, per_doc = [], {}
    for *_, r, snippet in ranked:
        per_doc[r["doc_id"]] = per_doc.get(r["doc_id"], 0) + 1
        if per_doc[r["doc_id"]] > PER_DOC and not full:
            continue
        hit = {"docId": r["doc_id"], "name": clean_doc_name(r["name"] or ""), "page": r["page"], "snippet": snippet}
        if full:
            hit["text"] = r["text"] or ""
        hits.append(hit)
        if len(hits) == limit:
            break
    return hits

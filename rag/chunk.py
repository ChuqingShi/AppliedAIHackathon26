"""Type-specific chunking. Every chunk gets a context header built from metadata, which is
embedded and keyword-indexed together with the text (metadata-only "contextual retrieval")."""
import re

from rag.embed import MAX_TOKENS, count_tokens
from rag.parse import find_dates

CHUNK_TOKENS = 450   # target incl. header; leaves headroom under the model's 512
MIN_TOKENS = 120     # don't close a chunk at a section change while it is smaller than this

NUMBERED_PARA_RE = re.compile(r"^\d{1,3}\.\s")
# ALL-CAPS lines that are not headings: caption names, firm names, notary venue blocks.
NOT_HEADING_RE = re.compile(r"[,)]$|\b(LLP|LLC|P\.?C\.?|ESQ|STATE OF|COUNTY OF|RAILROAD|SAPINI|FERRARA)\b|&")
TYPE_LABELS = {"court_filing": "Court filing", "medical_record": "Medical record",
               "medical_bill": "Medical bill", "intake": "Intake document"}


def is_heading(line: str, next_line: str) -> bool:
    """Short ALL-CAPS line followed by prose, e.g. 'AS AND FOR A FIRST AFFIRMATIVE DEFENSE:'.
    Requiring prose afterwards skips ALL-CAPS lists such as the injury list in a bill of particulars."""
    letters = re.sub(r"[^A-Za-z]", "", line)
    return (len(letters) >= 8 and letters.isupper() and len(line) <= 70 and len(line.split()) >= 2
            and not line[0].isdigit() and not NOT_HEADING_RE.search(line)
            and any(c.islower() for c in next_line))


def context_header(doc: dict, page_start: int, page_end: int, section: str | None = None,
                   event_date=None) -> str:
    parts = [TYPE_LABELS.get(doc["doc_type"], doc["doc_type"])]
    if doc["nyscef_no"]:
        parts.append(f"NYSCEF #{doc['nyscef_no']}")
    parts.append(doc["provider"] or doc["title"])
    if event_date:
        parts.append(f"visit {event_date}")
    elif doc["filed_at"]:
        parts.append(f"filed {doc['filed_at']}")
    elif doc["doc_date"]:
        parts.append(f"dated {doc['doc_date']}")
    parts.append(f"p.{page_start}" if page_start == page_end else f"pp.{page_start}-{page_end}")
    if section:
        parts.append(section)
    return "[" + " · ".join(parts) + "]"


def split_oversized(text: str, budget: int) -> list[str]:
    """Fallback for a single unit that is too long: pack sentences, then words, up to the budget."""
    pieces, current = [], ""
    for sentence in re.split(r"(?<=[.;:])\s+", text):
        candidate = f"{current} {sentence}".strip()
        if count_tokens(candidate) <= budget:
            current = candidate
            continue
        if current:
            pieces.append(current)
        current = sentence
        while count_tokens(current) > budget:  # a single sentence longer than the budget
            words = current.split()
            cut = len(words) // 2
            while cut > 1 and count_tokens(" ".join(words[:cut])) > budget:
                cut //= 2
            pieces.append(" ".join(words[:cut]))
            current = " ".join(words[cut:])
    if current:
        pieces.append(current)
    return pieces


def make_chunk(doc, n, text, page_start, page_end, chunk_type, section=None, event_date=None,
               parent_id=None, embed=True) -> dict:
    header = context_header(doc, page_start, page_end, section, event_date)
    if embed and count_tokens(f"{header}\n{text}") > MAX_TOKENS:
        raise ValueError(f"chunk {doc['id']}:{n} exceeds {MAX_TOKENS} tokens")
    return {
        "id": f"{doc['id']}:{n}",
        "document_id": doc["id"],
        "parent_id": parent_id,
        "chunk_type": chunk_type,
        "section": section,
        "page_start": page_start,
        "page_end": page_end,
        "event_date": event_date,
        "mentioned_dates": sorted({d.isoformat() for d in find_dates(text)}),
        "context_header": header,
        "text": text,
        "embed": embed,
    }


def chunk_court_filing(doc: dict) -> list[dict]:
    # 1. Units: a numbered paragraph or a heading starts a new unit; remember page + section.
    units, section = [], None
    lines = [(p["page"], line) for p in doc["pages"] for line in p["text"].splitlines() if line.strip()]
    for i, (page, line) in enumerate(lines):
        next_line = lines[i + 1][1] if i + 1 < len(lines) else ""
        if is_heading(line, next_line):
            section = line.rstrip(":")
            units.append({"page": page, "section": section, "text": line})
        elif NUMBERED_PARA_RE.match(line) or not units:
            units.append({"page": page, "section": section, "text": line})
        else:
            units[-1]["text"] += "\n" + line

    # 2. Parents: whole sections, stored for LLM context but not embedded.
    chunks, n, parents = [], 0, {}
    for u in units:
        key = u["section"] or "(start)"
        if key not in parents:
            parents[key] = {"text": [], "pages": [], "id": f"{doc['id']}:{n}"}
            n += 1
        parents[key]["text"].append(u["text"])
        parents[key]["pages"].append(u["page"])
    for key, p in parents.items():
        c = make_chunk(doc, p["id"].split(":")[1], "\n".join(p["text"]), min(p["pages"]), max(p["pages"]),
                       "section", section=key, embed=False)
        chunks.append(c)

    # 3. Children: merge consecutive units up to the token budget.
    budget = CHUNK_TOKENS - 60  # rough header allowance; make_chunk enforces the hard limit
    current = []

    def flush():
        nonlocal n, current
        if not current:
            return
        text = "\n".join(u["text"] for u in current)
        sec = current[0]["section"]
        chunks.append(make_chunk(doc, n, text, current[0]["page"], current[-1]["page"], "passage",
                                 section=sec, parent_id=parents[sec or "(start)"]["id"]))
        n += 1
        current = []

    for u in units:
        if count_tokens(u["text"]) > budget:
            flush()
            for piece in split_oversized(u["text"], budget):
                current = [{**u, "text": piece}]
                flush()
            continue
        section_changed = current and u["section"] != current[0]["section"]
        too_big = current and count_tokens("\n".join(x["text"] for x in current + [u])) > budget
        if too_big or (section_changed and count_tokens("\n".join(x["text"] for x in current)) >= MIN_TOKENS):
            flush()
        current.append(u)
    flush()
    return chunks


def chunk_per_page(doc: dict, chunk_type: str) -> list[dict]:
    """Medical records (one visit per page) and intake documents."""
    chunks, n = [], 0
    budget = CHUNK_TOKENS - 60
    for p in doc["pages"]:
        text = p["text"].strip()
        if not text:
            continue
        if p.get("title"):
            text = f"{p['title']}\n{text}"
        pieces = [text] if count_tokens(text) <= budget else split_oversized(text, budget)
        for piece in pieces:
            chunks.append(make_chunk(doc, n, piece, p["page"], p["page"], chunk_type,
                                     event_date=p.get("visit_date")))
            n += 1
    return chunks


def chunk_bill(doc: dict, rows: list[dict]) -> list[dict]:
    """One findable summary per bill. Amounts stay in bill_lines so sums come from SQL."""
    if not rows:
        return []
    dates = sorted(r["service_date"] for r in rows)
    services = sorted({r["description"] for r in rows})
    text = (f"Itemized bill from {doc['provider']}, statement date {doc['authored_at']}. "
            f"{len(rows)} service lines from {dates[0]} to {dates[-1]}. "
            f"Services: {'; '.join(services)}. Charges are in the bill_lines table.")
    budget = CHUNK_TOKENS - 60
    if count_tokens(text) > budget:
        text = split_oversized(text, budget)[0]
    return [make_chunk(doc, 0, text, 1, doc["page_count"], "bill_summary")]


def chunk_document(doc: dict, bill_rows: list[dict]) -> list[dict]:
    if doc["doc_type"] == "court_filing":
        return chunk_court_filing(doc)
    if doc["doc_type"] == "medical_record":
        return chunk_per_page(doc, "visit")
    if doc["doc_type"] == "medical_bill":
        return chunk_bill(doc, bill_rows)
    return chunk_per_page(doc, "passage")

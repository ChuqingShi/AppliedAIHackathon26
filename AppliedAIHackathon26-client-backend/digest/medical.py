"""Rule-based recovery status: per medical visit, and the conclusions of expert reports.

Every result keeps the sentence it was read from, so the dashboard can show (and link) the evidence.
The rules are tuned to this firm's records; each list is ordered and the first match wins.
"""
import re

# Treating providers, one visit per page. Order matters: a PT discharge note that mentions
# "residual pain" is still a discharge; "improving, continue care" is not recovered.
VISIT_RULES = [
    ("resolved", r"\bresolved\b|full(y)? recover|no (further|residual) (complaints|symptoms)"),
    # ER / surgery-center "discharged home" or "discharge instructions" are not a recovery.
    ("discharged", r"discharg\w* from (physical therapy|therapy|care|treatment|chiropractic)"),
    ("plateau", r"plateau\w*|maximum medical improvement|\bMMI\b|medically stationary"),
    ("not_recovered", r"totally disabled|partial(ly)? disab\w*|out of work|persistent|residual|remain(s)? reported"
                      r"|continues? to report|continue (the established|follow-up|rehabilitation|care|treatment)|recommended"),
    ("improving", r"improv\w*"),
]
# Imaging / electrodiagnostic studies describe findings, not recovery.
DIAGNOSTIC_TITLE_RE = re.compile(r"\b(MRI|CT|X-?ray|EMG|NCV|ultrasound|DTI)\b", re.IGNORECASE)
IMPRESSION_RE = re.compile(r"^(IMPRESSION|FINDINGS / IMPRESSION)$")

# Expert / IME reports. "\s*" between words tolerates OCR that drops spaces ("revealsno").
EXPERT_RULES = [
    ("resolved", r"\bresolved\b|full(y)?\s*recover"),
    ("plateau", r"plateau\w*|maximum\s*medical\s*improvement|medically\s*stationary"),
    ("can_work", r"able\s*to\s*work|without\s*restrictions|return(ed)?\s*to\s*(full\s*|regular\s*)?(work|duty)"),
    ("no_traumatic_injury", r"no\s*(evidence\s*of\s*)?(recent\s*|acute\s*)?(post-?\s*)?traumatic\s*(injury|findings)"
                            r"|\bdegenerative|pre-?\s*existing"),
    ("permanent", r"permanen(t|cy)"),
]
NOT_A_FINDING_RE = re.compile(r"Guides to the Evaluation", re.IGNORECASE)  # citations, not opinions
BULLET_RE = re.compile(r'^\s*([“"•\-]|\d+\.\s)')
HEADING_RE = re.compile(r"^[A-Z][A-Z /&,\-()]{2,40}$")  # 'REASSESSMENT', 'A / P'; kept out of sentences

LABELS = {"resolved": "resolved", "discharged": "discharged from care", "plateau": "plateaued",
          "not_recovered": "not recovered", "improving": "improving", "diagnostic": "diagnostic study",
          "unknown": "no status stated", "can_work": "able to work", "no_traumatic_injury": "no traumatic injury",
          "permanent": "permanent"}


def statements(text: str) -> list[str]:
    """Sentences, also splitting bullet/list lines that have no period (e.g. Tsao's diagnoses)."""
    lines = [" ".join(l.split()) for l in text.splitlines() if l.strip()]
    joined = ""
    for line in lines:
        if HEADING_RE.match(line):
            joined += "\n"
            continue
        joined += ("\n" if BULLET_RE.match(line) or not joined or joined.endswith("\n") else " ") + line
    parts = re.split(r"(?<=\.)\s+|\n", joined)
    return [p.strip(' “"•') for p in parts if len(p.strip()) > 3]


def first_match(sentences: list[str], rules) -> tuple[str, str] | None:
    """(category, sentence) for the highest-priority rule that matches any sentence."""
    for category, pattern in rules:
        for s in sentences:
            if re.search(pattern, s, re.IGNORECASE) and not NOT_A_FINDING_RE.search(s):
                return category, s
    return None


def work_status(body: str) -> str | None:
    """Text under a WORK STATUS heading (chiropractic notes), up to the next heading."""
    lines = body.splitlines()
    for i, line in enumerate(lines):
        if line.strip() in ("WORK STATUS", "PLAN AND WORK STATUS"):
            out = []
            for nxt in lines[i + 1:]:
                if re.fullmatch(r"[A-Z][A-Z /&]{3,}", nxt.strip()) or nxt.startswith("Clinician"):
                    break
                out.append(nxt.strip())
            return " ".join(out) or None
    return None


def visit_status(title: str | None, body: str) -> tuple[str, str | None]:
    """(recovery category, evidence sentence) for one visit page."""
    if title and DIAGNOSTIC_TITLE_RE.search(title):
        lines = body.splitlines()
        impression = next((lines[i + 1] for i, l in enumerate(lines[:-1]) if IMPRESSION_RE.match(l.strip())), None)
        return "diagnostic", impression
    hit = first_match(statements(body), VISIT_RULES)
    return hit if hit else ("unknown", None)


def visits(doc: dict) -> list[dict]:
    rows = []
    for p in doc["pages"]:
        if not p.get("text", "").strip():
            continue
        recovery, evidence = visit_status(p.get("title"), p["text"])
        rows.append({"doc_id": doc["id"], "page": p["page"], "provider": doc["provider"],
                     "visit_date": p.get("visit_date"), "title": p.get("title"),
                     "work_status": work_status(p["text"]), "recovery": recovery, "evidence": evidence})
    return rows


def expert_side(text: str) -> str | None:
    """The filer signs first ('Yours, etc. ... Attorneys for Defendants'); the served party comes later."""
    m = re.search(r"Attorneys?\s*for\s*(Plaintiff|Defendant)", text, re.IGNORECASE)
    return ("plaintiff" if m.group(1).lower() == "plaintiff" else "defense") if m else None


def expert_evidence(doc: dict) -> list[dict]:
    """Every sentence in an expert report that states a recovery/causation conclusion."""
    side = expert_side("\n".join(p["text"] for p in doc["pages"]))
    author = doc["title"].split()[-1].capitalize()  # 'ime orthopedic hostin' → 'Hostin'
    rows, seen = [], set()
    for p in doc["pages"]:
        for s in statements(p["text"]):
            hit = first_match([s], EXPERT_RULES)
            if hit and (hit[0], s) not in seen:
                seen.add((hit[0], s))
                rows.append({"doc_id": doc["id"], "page": p["page"], "author": author, "side": side,
                             "recovery": hit[0], "quote": re.sub(r"\s+\d+\.$", ".", s)[:300],
                             "doc_date": doc["doc_date"]})
    return rows

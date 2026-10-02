"""Digest the raw Clio records of one matter into the simple case record the
CaseBoard frontend shows (see client/src/data/case.ts for the shape).

Everything is read from SQLite; nothing here calls Clio. Fields Clio does not
hold come back as null and the frontend hides them rather than guessing.

Where each part of the record comes from in Clio:
  client, incident     the matter's client contact and its custom fields
  providers, bills     relationships described as medical, with amounts from
                       the latest "Specials tally" note (Clio has no bill field)
  financials           custom fields: Estimated Case Value, Policy Limits, ...
  stages               the matter stage, dated from notes and document folders
  to-do, deadline      open tasks; the matter's statute of limitations task
  documents            synced documents, named after their file
  updates              notes (firm only) and communications (shared with a
                       provider only when that provider was a party to them)

Much of this reads structure out of free text, so it is tuned to how this
firm writes its notes. Each heuristic is commented where it happens.
"""
import html
import json
import os
import re
from datetime import date

from db import connect
from digest import queries as doc_facts

FIRM_NAME = os.getenv("FIRM_NAME", "Law firm")  # not in Clio's matter data
FEE_SHARE = 1 / 3  # standard contingency fee, used for the settlement breakdown

# The personal-injury pipeline shown as the progress bar. Each stage is dated
# by the first note whose subject matches its pattern (or by a document folder).
STAGES = [
    ("Intake", None),
    ("Treatment", r"treatment commenced"),
    ("Records & bills", r"records collection|records received"),
    ("Demand sent", r"demand package"),
    ("Negotiation", r"negotiations opened"),
    ("Litigation", None),
    ("Settlement", None),
    ("Providers paid", None),
]
# A document whose file name matches this is the client's identity document.
PHOTO_ID = re.compile(r"photo[-_ ]?id|identification|driver'?s?[-_ ]?licen[cs]e|passport", re.I)
# A relationship whose description matches this is a medical provider.
MEDICAL = re.compile(r"medical provider|treating|hospital|surgeon", re.I)
# Words too common in provider names to tell providers apart when matching a
# line of the bills note to a provider (see tokens()).
GENERIC = {
    "medical", "provider", "providers", "services", "center", "offices", "office", "physical", "therapy",
    "associates", "hospital", "treating", "orthopaedic", "orthopedic", "surgical", "radiology", "medicine",
    "rehabilitation", "pllc", "york", "llc", "emergency", "care", "diagnostic", "imaging", "neurology",
    "chiropractic", "facility", "surgery", "shoulder", "left", "right", "arthroscopy", "also", "surgeon",
}
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
DAYS = "Mon Tue Wed Thu Fri Sat Sun".split()


# ---- small helpers ----

def _d(s) -> date | None:
    """Clio date or datetime string -> date (None if missing or malformed)."""
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def fmt(s, weekday=False) -> str:
    """Display date: "Sep 22, 2026", or "Tue, Sep 22, 2026" with weekday=True.
    The year is always shown because this matter spans 2023-2026."""
    d = _d(s)
    if not d:
        return ""
    out = f"{MONTHS[d.month - 1]} {d.day}, {d.year}"
    return f"{DAYS[d.weekday()]}, {out}" if weekday else out


def initials(name: str) -> str:
    """ "Justin Sapini" -> "JS", for the avatar circles."""
    parts = [p for p in re.split(r"\s+", name or "") if p and p[0].isalpha()]
    return ((parts[0][0] + parts[-1][0]) if len(parts) > 1 else (parts[0][:2] if parts else "?")).upper()


def slug(name: str) -> str:
    """A provider's id in URLs and accounts: "Peter C. Kwan" -> "peter-c-kwan"."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def money_in(text) -> float | None:
    """The first dollar amount in a piece of text: "Medicaid lien, $22,180.00" -> 22180.0."""
    m = re.search(r"\$([\d,]+(?:\.\d+)?)", text or "")
    return float(m.group(1).replace(",", "")) if m else None


def tokens(text: str) -> set[str]:
    """The distinctive words in a name, for fuzzy matching: "Hudson Valley Radiology
    Associates" -> {"hudson", "valley"}. Short and GENERIC words are dropped."""
    return {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z\-]{3,}", text or "")} - GENERIC


def first_sentence(text: str) -> str:
    """Keeps the cards short: most Clio fields lead with the point."""
    return re.split(r"(?<=\.)\s", (text or "").strip(), maxsplit=1)[0]


def brief(text: str, limit: int = 200) -> str:
    """The opening of a note or message, cut at a word boundary."""
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def clean_doc_name(name: str) -> str:
    """A readable title from a file name:
    "04-medical-records__created__sportscare-physical-therapy-records-2023-06-29.pdf"
    -> "Sportscare physical therapy records"."""
    base = re.sub(r"\.[a-z0-9]+$", "", name, flags=re.I)
    base = base.split("__")[-1]
    base = re.sub(r"-\d{4}-\d{2}-\d{2}$", "", base).replace("-", " ").strip()
    return base[:1].upper() + base[1:]


# ---- loading ----

def synced_matters() -> list[dict]:
    """The matters in SQLite, most recently changed first (for GET /cases)."""
    with connect() as conn:
        rows = conn.execute("SELECT data FROM raw_records WHERE kind='matter' ORDER BY changed_at DESC").fetchall()
    return [{k: m.get(k) for k in ("id", "display_number", "description", "status")}
            for m in (json.loads(r["data"]) for r in rows)]


def _load(matter_id: int | None) -> dict[str, list[dict]]:
    """Every raw record of one matter, grouped by kind ("note", "task", ...).
    With no matter_id, the most recently synced matter."""
    with connect() as conn:
        if matter_id is None:
            row = conn.execute("SELECT matter_id FROM raw_records WHERE kind='matter' ORDER BY changed_at DESC LIMIT 1").fetchone()
            if not row:
                raise LookupError("No matter has been synced yet. Run: python sync.py <matter_id>")
            matter_id = row["matter_id"]
        rows = conn.execute("SELECT kind, data FROM raw_records WHERE matter_id=?", (matter_id,)).fetchall()
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(r["kind"], []).append(json.loads(r["data"]))
    if not out.get("matter"):
        raise LookupError(f"Matter {matter_id} has not been synced")
    return out


# ---- the digest ----

def build_case(matter_id: int | None = None) -> dict:
    """The full case record the law firm sees (GET /case). Its shape matches the
    Case type in client/src/data/types.ts; keep the two in step."""
    raw = _load(matter_id)
    today = date.today()
    m = raw["matter"][0]
    cf = {f["field_name"]: f["value"] for f in m.get("custom_field_values") or []}
    contacts = {c["id"]: c for c in raw.get("contact", [])}
    rels = raw.get("relationship", [])
    notes = sorted(raw.get("note", []), key=lambda n: n.get("date") or "")
    comms = sorted(raw.get("communication", []), key=lambda c: c.get("date") or "")
    tasks = raw.get("task", [])
    docs = raw.get("document", [])
    acts = raw.get("activity", [])

    # The first related contact whose relationship description matches, e.g. "Adverse party".
    def rel(pattern):
        return next((r["contact"]["name"] for r in rels if re.search(pattern, r.get("description") or "", re.I)), None)

    defendant = rel(r"adverse party") or rel(r"adverse")

    # client
    cl = contacts.get((m.get("client") or {}).get("id"), {"name": (m.get("client") or {}).get("name", "")})
    dob = _d(cl.get("date_of_birth"))
    age = (today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))) if dob else None
    addr = (cl.get("addresses") or [{}])[0]
    client = {
        "name": cl.get("name", ""), "initials": initials(cl.get("name", "")),
        "dob": fmt(dob), "age": age,
        "phone": ((cl.get("phone_numbers") or [{}])[0]).get("number"),
        "email": ((cl.get("email_addresses") or [{}])[0]).get("address"),
        "address": ", ".join(x for x in (addr.get("street"), addr.get("city"), addr.get("province")) if x) or None,
        "language": None, "bestTime": None,
        # "Financial advisor, Northwestern Mutual, 875 Third Avenue, ..." -> job and employer only
        "occupation": ", ".join(first_sentence(re.sub(r"^\$[\d,.]+ claimed to date\.\s*", "", cf.get("Wage Loss Claimed") or "")).split(", ")[:2]) or None,
    }

    # incident and injuries. The matter description reads
    # "Sapini, Justin — MVA (Cedar St & Garden St, ...)": the part after the dash is the type.
    desc = m.get("description") or ""
    mtype = re.search(r"—\s*([^()]+?)\s*(\(|$)", desc)
    summary = cf.get("Case Summary") or ""
    # "Case Summary" is "<what happened>. <injuries>.": split it in two.
    injury_text = summary.split(". ", 1)[1] if ". " in summary else summary
    incident = {
        "date": fmt(cf.get("Date of Incident")),
        "type": {"MVA": "Motor vehicle collision"}.get(mtype.group(1).strip(), mtype.group(1).strip()) if mtype else "",
        "location": cf.get("Accident Location") or "",
        "summary": first_sentence(summary),
    }
    injuries = [{"name": injury_text.rstrip("."), "status": first_sentence(cf.get("Treatment Status") or ""), "by": ""}] if injury_text else []

    # providers: medical relationships, billed amounts from the latest "specials tally" note.
    # Clio has no field for what each provider billed; the firm keeps a running
    # tally in a note, one bullet per provider:
    #   - Physiatry, Dr. Abramov: $1,450.00
    # Each bullet is matched to the provider whose name (or description) shares
    # the most distinctive words with it. The amounts add up to the "Medical
    # Specials To Date" custom field, which is a useful check.
    medical = [r for r in rels if MEDICAL.search(r.get("description") or "")]
    tally = next((n for n in reversed(notes) if re.search(r"specials tally", n.get("subject") or "", re.I) and "- " in (n.get("detail") or "")), None)
    bills = [ln[2:] for ln in html.unescape((tally or {}).get("detail") or "").splitlines() if ln.startswith("- ")]
    billed: dict[int, float] = {}
    for line in bills:
        amount = money_in(line)
        words = tokens(line.split(":")[0])
        def score(field, words=words):
            return len(tokens(field) & words)
        # prefer a match on the provider's name, then on its description; companies win ties
        best = max(medical, default=None, key=lambda r: (score(r["contact"]["name"]), score(r.get("description") or ""),
                                                       contacts.get(r["contact"]["id"], {}).get("type") == "Company"))
        if best and amount and (score(best["contact"]["name"]) or score(best.get("description") or "")):
            billed[best["contact"]["id"]] = billed.get(best["contact"]["id"], 0) + amount

    med_docs = [d for d in docs if re.search(r"medical", (d.get("parent") or {}).get("name") or "", re.I)]
    pending_tasks = [t for t in tasks if t.get("status") != "complete"]

    providers, provider_files = [], {}
    for r in medical:
        cid, name = r["contact"]["id"], r["contact"]["name"]
        if cid not in billed and contacts.get(cid, {}).get("type") == "Person":
            continue  # a clinician at a practice that is already listed (e.g. a surgeon at McCulloch)
        pid = slug(name)
        key = tokens(name)
        # this provider's files in the medical folders, matched on the same distinctive words
        mine = [d for d in med_docs if key & tokens(d["name"].replace("-", " "))]
        has_records = any("record" in d["name"] for d in mine)
        # open tasks naming the provider ("By medical provider: <name> - ...") are what
        # the firm is waiting on from them; they show as "Needed from you" on their dashboard
        asks = [t for t in pending_tasks if name.lower() in (t.get("name") or "").lower()]
        # a named clinician in the description, e.g. "(Kevin M. Haggerty, D.C.)"
        person = re.search(r"\(([A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-z]+), (?:M\.D\.|D\.C\.|D\.O\.)", r.get("description") or "")
        contact = person.group(1) if person else "Billing office"
        providers.append({"id": pid, "name": name, "billed": billed.get(cid, 0),
                          "records": "good" if has_records else "warn",
                          "bill": "warn" if asks or cid not in billed else "good", "contact": contact})
        # "patient since": the first service date on the provider's medical-charges entry
        services = next((re.search(r"services (\d{4}-\d{2}-\d{2})", a.get("note") or "") for a in acts
                         if name.split(",")[0].lower() in (a.get("note") or "").lower()), None)
        provider_files[pid] = {
            "user": {"name": contact, "initials": initials(contact), "role": f"{name} · Billing"},
            "patientSince": fmt(services.group(1)) if services else "",
            "billLines": [{"name": "Itemized charges", "amount": billed[cid]}] if cid in billed else [],
            "documents": [{"name": clean_doc_name(d["name"]), "date": f"Received {fmt(d.get('received_at'))}",
                           "status": "good", "label": "Received"} for d in mine],
            "requests": [_request(t, name, today) for t in sorted(asks, key=lambda t: t.get("due_at") or "")],
        }
    bills_total = sum(p["billed"] for p in providers)

    # financials (Clio has no structured offer/demand, so those stay null)
    # Case costs are the firm's own expense entries; the medical-charge entries are
    # the providers' bills, already counted above.
    expenses = sum(a.get("total") or 0 for a in acts if a.get("total") and not re.search(r"medical treatment", a.get("note") or "", re.I))
    # The rationale's last paragraph is the firm's bottom line ("The case is worth more
    # than the coverage..."), shown as the callout under the financials.
    rationale = (cf.get("Case Value Rationale") or "").split("\n")
    financials = {
        "offer": None, "offerDate": None, "demand": None, "demandDate": None,
        "targetLow": None, "targetHigh": None, "counter": None, "counterDue": None,
        "estimatedValue": cf.get("Estimated Case Value"),
        "policyLimit": money_in(cf.get("Policy Limits")),  # the first line: the defendant's per-person limit
        "liens": money_in(cf.get("Health Insurance or Lien Holder")),  # what comes off the recovery
        "costs": expenses, "feeShare": FEE_SHARE,
        "note": (rationale[-1] if len(rationale) > 1 else rationale[0]) or None,
    }

    # deadline: the matter's statute of limitations task
    sol_id = (m.get("statute_of_limitations") or {}).get("id")
    sol = next((t for t in tasks if t["id"] == sol_id), None)
    deadline = None
    if sol and _d(sol.get("due_at")):
        deadline = {"label": "Statute of limitations", "date": fmt(sol["due_at"]),
                    "daysLeft": (_d(sol["due_at"]) - today).days, "met": sol.get("status") == "complete"}

    # stages: where Clio's matter stage ("Litigation") sits in the STAGES pipeline.
    # Matching on the first five letters tolerates small naming differences.
    names = [s[0] for s in STAGES]
    current = (m.get("matter_stage") or {}).get("name") or ""
    idx = next((i for i, n in enumerate(names) if n.lower().startswith(current.lower()[:5])), None) if current else None
    if idx is None:
        idx = 0
    pleadings = sorted(d.get("received_at") or "" for d in docs if re.search(r"pleading", (d.get("parent") or {}).get("name") or "", re.I))
    # Date each stage reached so far; later stages read "Upcoming".
    stages = []
    for i, (name, pat) in enumerate(STAGES):
        when = m.get("open_date") if i == 0 else (pleadings[0] if name == "Litigation" and pleadings else None)
        if pat:
            n = next((n for n in notes if re.search(pat, n.get("subject") or "", re.I)), None)
            when = n and n.get("date")
        stages.append({"name": name, "date": fmt(when) if i <= idx and when else ("Upcoming" if i > idx else "")})

    # to-do: open tasks, soonest first; overdue or due within a week is urgent
    todo = []
    for t in sorted(pending_tasks, key=lambda t: t.get("due_at") or "9999"):
        due = _d(t.get("due_at"))
        title = re.sub(r"^By medical provider:\s*", "", t.get("name") or "")
        todo.append({"title": title, "who": (t.get("assignee") or {}).get("name", ""),
                     "due": fmt(due, weekday=True) if due else "No due date",
                     # negative once overdue; lets the overview tell "overdue" from "due soon"
                     "daysLeft": (due - today).days if due else None,
                     "urgent": bool(due and (due - today).days <= 7)})

    # documents, newest first; the four most recent are "important"
    # docDate/summary come from the document digest (digest/), when it has been run.
    facts = doc_facts.document_facts(m["id"])
    documents = []
    for i, d in enumerate(sorted(docs, key=lambda d: d.get("received_at") or "", reverse=True)):
        folder = re.sub(r"^\d+\s*", "", (d.get("parent") or {}).get("name") or "")
        documents.append({"id": d["id"], "name": clean_doc_name(d["name"]), "kind": folder,
                          "date": fmt(d.get("received_at")), "important": i < 4,
                          **({"docDate": fmt(facts[d["id"]]["docDate"]), "summary": facts[d["id"]]["summary"]}
                             if d["id"] in facts else {})})

    # the client's photo ID, if the firm has one on file: found by its file name,
    # newest first. Only its id goes out; GET /documents/{id}/image serves the picture.
    photo_id = next((d["id"] for d in sorted(docs, key=lambda d: d.get("received_at") or "", reverse=True)
                     if PHOTO_ID.search(d.get("name") or "")), None)

    # updates: notes stay inside the firm; a communication is shared with a
    # provider only when that provider was a party to it.
    by_name = {p["name"]: p["id"] for p in providers}
    updates = []
    for n in notes:
        updates.append((n.get("date") or "", {"date": fmt(n.get("date")), "audience": "firm", "icon": "doc",
                        "firm": {"t": n.get("subject") or "Note", "s": brief(html.unescape(n.get("detail") or ""))}}))
    for c in comms:
        parties = [p.get("name") for p in (c.get("senders") or []) + (c.get("receivers") or [])]
        shared_with = next((by_name[p] for p in parties if p in by_name), None)
        icon = "phone" if c.get("type") == "PhoneCommunication" else "mail"
        u = {"date": fmt(c.get("date")), "audience": shared_with or "firm", "icon": icon,
             "firm": {"t": c.get("subject") or "Message", "s": brief(c.get("body") or "")}}
        if shared_with:
            u["shared"] = {"t": c.get("subject") or "Message", "s": "Correspondence between you and the law firm."}
        updates.append((c.get("date") or "", u))
    updates = [u for _, u in sorted(updates, key=lambda x: x[0], reverse=True)]

    # team: everyone assigned work or writing as a firm user. The first is the
    # providers' "main contact". Clio's records here don't say who is the lead
    # attorney, so everyone is listed as "Legal team".
    team_names = []
    for t in tasks:
        n = (t.get("assignee") or {}).get("name")
        if n and n not in team_names:
            team_names.append(n)
    for c in comms:
        for p in (c.get("senders") or []) + (c.get("receivers") or []):
            if p.get("type") == "User" and p.get("name") not in team_names:
                team_names.append(p["name"])
    team = [{"name": n, "initials": initials(n), "role": "Legal team", "main": i == 0} for i, n in enumerate(team_names)]

    # start and end of the case: the matter's open and close dates in Clio. An open
    # matter has no close date, so "closed" stays null and the card says "Still open".
    opened, closed = _d(m.get("open_date")), _d(m.get("close_date"))
    dates = {"opened": fmt(opened) or None, "closed": fmt(closed) or None,
             "length": _length(opened, closed or today) if opened else None}

    last = (cl.get("last_name") or client["name"].split(" ")[-1])
    return {
        "id": m.get("display_number") or str(m["id"]),
        "matterId": m["id"],
        "title": f"{last} v. {defendant}" if defendant else desc,
        # for the sidebar: "Sapini v. Metro-North" (the defendant's first word)
        "shortTitle": f"{last} v. {defendant.split()[0]}" if defendant else desc,
        "firm": FIRM_NAME,
        "stages": stages, "stageIndex": idx,
        "dates": dates,
        "client": client, "incident": incident, "injuries": injuries,
        "financials": financials,
        "defendant": defendant,
        "insurer": {"name": first_sentence(cf.get("Insurance Carrier") or "").rstrip(".") or None,
                    "claim": cf.get("Claim Number"), "adjuster": None},
        "deadline": deadline,
        "billsTotal": bills_total,
        "providers": providers, "tasks": todo, "documents": documents, "updates": updates,
        "team": team, "user": team[0] if team else {"name": "Firm user", "initials": "FU", "role": "Legal team"},
        "providerFiles": provider_files,
        # Firm only: for_provider() copies explicit keys, so this never reaches a provider.
        "recovery": doc_facts.recovery(m["id"]),
        # Firm only, like recovery: an identity document must never reach a provider or the client.
        "photoIdDoc": photo_id,
    }


def _length(start: date, end: date) -> str:
    """How long between two dates, in words: "3 years, 4 months"."""
    months = (end.year - start.year) * 12 + end.month - start.month - (end.day < start.day)
    years, months = divmod(max(months, 0), 12)
    parts = [f"{n} {unit}{'s' if n != 1 else ''}" for n, unit in ((years, "year"), (months, "month")) if n]
    return ", ".join(parts) or "less than a month"


def _request(t: dict, provider: str, today: date) -> dict:
    """An open task, worded for the provider it is waiting on."""
    due = _d(t.get("due_at"))
    title = re.sub(rf"^By medical provider:\s*{re.escape(provider)}\s*-\s*", "", t.get("name") or "")
    return {"title": title, "detail": first_sentence(t.get("description") or ""),
            "due": fmt(due, weekday=True) if due else "", "daysLeft": (due - today).days if due else 0}


def for_provider(c: dict, provider_id: str | None = None) -> dict:
    """The record a provider may see. Whitelist only: financials, strategy, tasks,
    other providers and firm-only updates never leave the server."""
    if provider_id is None:  # demo default: the provider we are waiting on soonest
        withreq = [p for p in c["providers"] if c["providerFiles"][p["id"]]["requests"]]
        provider_id = (withreq or c["providers"])[0]["id"]
    me = next((p for p in c["providers"] if p["id"] == provider_id), None)
    if not me:
        raise LookupError(f"No provider '{provider_id}' on this case")
    f = c["providerFiles"][provider_id]
    cl = c["client"]
    return {
        "id": c["id"], "firm": c["firm"], "stages": c["stages"], "stageIndex": c["stageIndex"],
        "provider": {"id": me["id"], "name": me["name"]},
        "user": f["user"],
        "patient": {"name": cl["name"], "initials": cl["initials"], "dob": cl["dob"], "age": cl["age"],
                    "phone": cl["phone"], "since": f["patientSince"]},
        "incident": {"date": c["incident"]["date"], "type": c["incident"]["type"], "summary": c["incident"]["summary"]},
        "injuries": c["injuries"],
        "lien": me["billed"],
        "billLines": f["billLines"], "documents": f["documents"], "requests": f["requests"],
        "updates": [{"date": u["date"], "icon": u["icon"], "t": u["shared"]["t"], "s": u["shared"]["s"]}
                    for u in c["updates"] if u.get("shared") and u["audience"] in ("all", provider_id)],
        "team": c["team"],
    }

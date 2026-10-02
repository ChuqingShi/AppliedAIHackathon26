"""FastAPI app: Clio OAuth login, sync trigger, and the API the dashboard reads.

  Clio (read-only)  --sync.py-->  SQLite (sapini.db)  --case_view.py-->  GET /case  -->  client/

Run:  uvicorn main:app --host 127.0.0.1 --port 8000
Then: open http://127.0.0.1:8000/login   (use 127.0.0.1, not localhost)
(--reload works too, but on Windows it can hang and leave the port taken.)
"""
import json
import os
import secrets
from datetime import datetime, timezone

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response

import case_view
import patient_id
import clio
import sync as sync_mod
from db import connect
from digest import queries as doc_facts
from digest import search as doc_search

app = FastAPI(title="Sapini case dashboard API")
# OAuth "state" values we handed out; /callback only accepts one of these (CSRF guard).
_states: set[str] = set()


# ---- Clio sign-in and sync ----

@app.get("/login")
def login():
    """Send the browser to Clio to approve this app."""
    state = secrets.token_urlsafe(16)
    _states.add(state)
    return RedirectResponse(clio.authorize_url(state))


@app.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    """Clio redirects here after approval; trade the code for tokens (stored in SQLite)."""
    if error:
        raise HTTPException(400, f"Clio returned error: {error}")
    if not code or state not in _states:
        raise HTTPException(400, "Missing code or bad state. Start again at /login")
    _states.discard(state)
    clio.exchange_code(code)
    return RedirectResponse("/me")


@app.get("/me")
def me():
    """Quick check that the token works."""
    return clio.get("/users/who_am_i.json", {"fields": "id,name,email"})["data"]


@app.get("/matters")
def matters(status: str | None = "open", query: str | None = None):
    """Matters in Clio. status: open, pending, closed, or empty for all."""
    return sync_mod.list_matters(status=status or None, query=query)


@app.post("/sync")
def run_sync(matter_id: int | None = None, query: str | None = None, all: bool = False, files: bool = True):
    """Sync one matter (?matter_id= or ?query=) or every open matter (?all=true)."""
    if all:
        return sync_mod.sync_all(download_files=files)
    if matter_id is None and not query:
        raise HTTPException(400, "Pass matter_id, query, or all=true")
    try:
        return sync_mod.sync(matter_id=matter_id, query=query, download_files=files)
    except LookupError as e:
        raise HTTPException(404, str(e))


# ---- What the dashboard reads (from SQLite only; these never call Clio) ----

@app.get("/cases")
def cases():
    """Matters that have been synced into SQLite."""
    return case_view.synced_matters()


@app.get("/case")
def case(matter_id: int | None = None):
    """The digested case record the law firm sees (defaults to the latest synced matter)."""
    try:
        return case_view.build_case(matter_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/documents/{doc_id}")
def document(doc_id: int):
    """A synced document file, shown inline in the browser."""
    with connect() as conn:
        row = conn.execute("SELECT path FROM doc_files WHERE doc_id=?", (doc_id,)).fetchone()
    if not row or not os.path.isfile(row["path"]):
        raise HTTPException(404, "That document has not been downloaded. Re-sync without --no-files.")
    name = os.path.basename(row["path"]).split("__", 1)[-1]
    return FileResponse(row["path"], filename=name, content_disposition_type="inline")


# ---- The patient ID: their identity document and their portrait (patient_id.py) ----

def _document_picture(doc_id: int) -> tuple[bytes, str]:
    try:
        return patient_id.picture(patient_id.document_path(doc_id))
    except LookupError as e:
        raise HTTPException(404, str(e))


def _picture_response(data: bytes, ext: str) -> Response:
    # private: it can be an identity document, so browsers mustn't keep a shared copy
    return Response(data, media_type=f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}",
                    headers={"Cache-Control": "private, no-store"})


@app.get("/case/patient-id")
def case_patient_id(matter_id: int | None = None):
    """Which document is the patient's photo ID and why, and whether a face was found
    on it (with where). Firm only: it names the ID document."""
    try:
        return patient_id.summary(matter_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/documents/{doc_id}/image")
def document_image(doc_id: int):
    """A synced document as a picture, for a thumbnail."""
    return _picture_response(*_document_picture(doc_id))


@app.get("/documents/{doc_id}/photo")
def document_photo(doc_id: int, face_only: bool = False):
    """Just the portrait from an ID document (the small photo frame on the card),
    or the whole picture if no face can be found in it. With face_only, no face
    means 404 instead: medical providers get the face and never the whole ID."""
    data, ext = _document_picture(doc_id)
    face = patient_id.portrait(data)
    if face:
        return _picture_response(face, "jpeg")
    if face_only:
        raise HTTPException(404, "No face found in that document")
    return _picture_response(data, ext)


# ---- Facts read out of the documents (built by `python -m digest`; firm only) ----

@app.get("/case/recovery")
def case_recovery(matter_id: int | None = None):
    """Latest recovery status per treating provider and the expert conclusions, with quote and page."""
    try:
        return doc_facts.recovery(matter_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/case/bills")
def case_bills(matter_id: int | None = None):
    """Every charge line from the itemized bills, with exact per-provider totals."""
    try:
        return doc_facts.bills(matter_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/case/timeline")
def case_timeline(matter_id: int | None = None):
    """Documents ordered by their real date (filing stamp, letter date, visit or statement date)."""
    try:
        return doc_facts.timeline(matter_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/case/search")
def case_search(q: str, matter_id: int | None = None, limit: int = 8, full: bool = False):
    """The document pages that best match a question, each with its document, page and the matching passage."""
    try:
        return doc_search.search(q, matter_id, limit=max(1, min(limit, 20)), full=full)
    except LookupError as e:
        raise HTTPException(404, str(e))


@app.get("/case/provider")
def provider_case(matter_id: int | None = None, provider_id: str | None = None):
    """The trimmed record one medical provider may see. Trimming happens here, never in the browser."""
    try:
        return case_view.for_provider(case_view.build_case(matter_id), provider_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


# ---- What each dashboard user saves about their own view (SQLite only, never Clio) ----

# Far more than a real layout needs: a few dozen tile ids.
MAX_LAYOUT_BYTES = 20_000


@app.get("/users/{user_id}/overview")
def overview_layout(user_id: str):
    """How this user arranged their overview, or null if they never changed it."""
    with connect() as conn:
        row = conn.execute("SELECT layout FROM overview_layouts WHERE user_id=?", (user_id,)).fetchone()
    return json.loads(row["layout"]) if row else None


@app.put("/users/{user_id}/overview")
def save_overview_layout(user_id: str, layout: dict = Body(...)):
    """Replace this user's overview layout. The dashboard decides what a valid layout is; this only stores it."""
    data = json.dumps(layout)
    if len(data) > MAX_LAYOUT_BYTES:
        raise HTTPException(413, "That layout is too large to save")
    with connect() as conn:
        conn.execute(
            """INSERT INTO overview_layouts(user_id, layout, updated_at) VALUES (?,?,?)
               ON CONFLICT(user_id) DO UPDATE SET layout=excluded.layout, updated_at=excluded.updated_at""",
            (user_id, data, datetime.now(timezone.utc).isoformat()),
        )
    return layout


# ---- What the client corrected about themselves (SQLite only, never Clio) ----

# Far more than the details need: a handful of short fields.
MAX_DETAILS_BYTES = 5_000


# {case_id:path} because a matter's display number may contain a slash.
@app.get("/cases/{case_id:path}/client-details")
def client_details(case_id: str):
    """What the client changed about their own details on this case, or null if they changed nothing."""
    with connect() as conn:
        row = conn.execute("SELECT details FROM client_details WHERE case_id=?", (case_id,)).fetchone()
    return json.loads(row["details"]) if row else None


@app.put("/cases/{case_id:path}/client-details")
def save_client_details(case_id: str, details: dict = Body(...)):
    """Replace the client's own details on this case. The dashboard checks them and lets only the client change them; this only stores them."""
    data = json.dumps(details)
    if len(data) > MAX_DETAILS_BYTES:
        raise HTTPException(413, "Those details are too large to save")
    with connect() as conn:
        conn.execute(
            """INSERT INTO client_details(case_id, details, updated_at) VALUES (?,?,?)
               ON CONFLICT(case_id) DO UPDATE SET details=excluded.details, updated_at=excluded.updated_at""",
            (case_id, data, datetime.now(timezone.utc).isoformat()),
        )
    return details


# ---- Questions the firm sends to a provider or the client, and their answers (SQLite only, never Clio) ----

# Far more than a message needs.
MAX_INQUIRY_BYTES = 20_000


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _inquiry(row) -> dict:
    """An inquiry as the dashboard reads it (the Inquiry type in client/src/data/types.ts)."""
    return {"id": row["id"], "asked": row["asked"], "to": {"id": row["to_id"], "name": row["to_name"]},
            "from": row["from_name"], "message": row["message"], "sentAt": row["sent_at"], "seenAt": row["seen_at"],
            "reply": row["reply"], "repliedBy": row["replied_by"], "repliedAt": row["replied_at"],
            "closedAt": row["closed_at"]}


@app.get("/cases/{case_id:path}/inquiries")
def inquiries(case_id: str):
    """Every question sent on this case, newest first. The dashboard hands each role only its own."""
    with connect() as conn:
        rows = conn.execute("SELECT * FROM inquiries WHERE case_id=? ORDER BY id DESC", (case_id,)).fetchall()
    return [_inquiry(r) for r in rows]


@app.post("/cases/{case_id:path}/inquiries")
def send_inquiry(case_id: str, inquiry: dict = Body(...)):
    """Send a question: {asked, to: {id, name}, from, message}. The dashboard checks who may send what to whom; this only stores it."""
    if len(json.dumps(inquiry)) > MAX_INQUIRY_BYTES:
        raise HTTPException(413, "That message is too large to send")
    try:
        values = (case_id, inquiry.get("asked"), inquiry["to"]["id"], inquiry["to"]["name"], inquiry["from"],
                  inquiry["message"], _now())
    except (KeyError, TypeError):
        raise HTTPException(422, "An inquiry needs to: {id, name}, from and message")
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO inquiries(case_id, asked, to_id, to_name, from_name, message, sent_at) VALUES (?,?,?,?,?,?,?)",
            values)
        return _inquiry(conn.execute("SELECT * FROM inquiries WHERE id=?", (cur.lastrowid,)).fetchone())


@app.patch("/inquiries/{inquiry_id}")
def update_inquiry(inquiry_id: int, change: dict = Body(...)):
    """Move a question along: {seen: true} once its recipient has read it, {reply, repliedBy} when they
    answer, {closed: true} when the firm is done with it. Each is stamped once, with the time it happened."""
    if len(json.dumps(change)) > MAX_INQUIRY_BYTES:
        raise HTTPException(413, "That reply is too large to send")
    now = _now()
    with connect() as conn:
        if change.get("seen"):
            conn.execute("UPDATE inquiries SET seen_at=? WHERE id=? AND seen_at IS NULL", (now, inquiry_id))
        if change.get("reply"):
            conn.execute(
                "UPDATE inquiries SET reply=?, replied_by=?, replied_at=?, seen_at=coalesce(seen_at, ?) WHERE id=?",
                (change["reply"], change.get("repliedBy"), now, now, inquiry_id))
        if change.get("closed"):
            conn.execute("UPDATE inquiries SET closed_at=? WHERE id=? AND closed_at IS NULL", (now, inquiry_id))
        row = conn.execute("SELECT * FROM inquiries WHERE id=?", (inquiry_id,)).fetchone()
    if not row:
        raise HTTPException(404, "No such inquiry")
    return _inquiry(row)

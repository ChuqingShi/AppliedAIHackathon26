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


def _document_picture(doc_id: int) -> tuple[bytes, str]:
    """A synced document as a picture: the first image inside it (a scanned ID is
    one embedded JPEG), or its first page rendered if it has none. Returns (bytes, ext)."""
    import pymupdf  # only the picture endpoints need it

    with connect() as conn:
        row = conn.execute("SELECT path FROM doc_files WHERE doc_id=?", (doc_id,)).fetchone()
    if not row or not os.path.isfile(row["path"]):
        raise HTTPException(404, "That document has not been downloaded. Re-sync without --no-files.")
    with pymupdf.open(row["path"]) as pdf:
        if not pdf.page_count:
            raise HTTPException(404, "That document has no pages")
        images = pdf[0].get_images(full=True)
        if images:
            img = pdf.extract_image(images[0][0])
            return img["image"], img["ext"]
        return pdf[0].get_pixmap(dpi=110).tobytes("png"), "png"


def _picture_response(data: bytes, ext: str) -> Response:
    # private: it can be an identity document, so browsers mustn't keep a shared copy
    return Response(data, media_type=f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}",
                    headers={"Cache-Control": "private, no-store"})


def _portrait(data: bytes) -> bytes | None:
    """The portrait on an ID card: finds the largest face (OpenCV's built-in face
    detector) and crops a passport-style 3:4 head-and-shoulders frame around it.
    None when no face is found, so the caller can fall back to the whole picture."""
    import cv2  # opencv-python-headless < 5: version 5 dropped the built-in face models
    import numpy as np

    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    if not len(faces):
        return None
    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    # Frame: 1.4x the face's width (a close head-and-shoulders crop), 4:3 tall, with the face a little above centre
    # (room for the shoulders), moved back inside the picture if it runs off an edge.
    cw = min(int(fw * 1.4), w)
    ch = min(int(cw * 4 / 3), h)
    x0 = min(max(int(fx + fw / 2 - cw / 2), 0), w - cw)
    y0 = min(max(int(fy + fh * 0.45 - ch * 0.42), 0), h - ch)
    ok, out = cv2.imencode(".jpg", img[y0:y0 + ch, x0:x0 + cw], [cv2.IMWRITE_JPEG_QUALITY, 92])
    return out.tobytes() if ok else None


@app.get("/documents/{doc_id}/image")
def document_image(doc_id: int):
    """A synced document as a picture, for a thumbnail."""
    return _picture_response(*_document_picture(doc_id))


@app.get("/documents/{doc_id}/photo")
def document_photo(doc_id: int):
    """Just the portrait from an ID document (the small photo frame on the card),
    or the whole picture if no face can be found in it."""
    data, ext = _document_picture(doc_id)
    face = _portrait(data)
    return _picture_response(face, "jpeg") if face else _picture_response(data, ext)


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

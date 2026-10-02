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
from fastapi.responses import FileResponse, RedirectResponse

import case_view
import clio
import sync as sync_mod
from db import connect

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

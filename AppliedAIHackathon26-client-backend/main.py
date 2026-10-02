"""FastAPI app: Clio OAuth login + sync trigger.

Run:  uvicorn main:app --host 127.0.0.1 --port 8000 --reload
Then: open http://127.0.0.1:8000/login   (use 127.0.0.1, not localhost)
"""
import os
import secrets

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse

import case_view
import clio
import sync as sync_mod
from db import connect

app = FastAPI(title="Sapini case dashboard API")
_states: set[str] = set()


@app.get("/login")
def login():
    state = secrets.token_urlsafe(16)
    _states.add(state)
    return RedirectResponse(clio.authorize_url(state))


@app.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
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

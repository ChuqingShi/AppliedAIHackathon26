"""Read-only Clio Manage API v4 client with OAuth token refresh and pagination.

This module only ever issues GET requests (plus the OAuth token exchange).
"""
import os
import time
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv

from db import connect

load_dotenv()
CLIENT_ID = os.environ["CLIO_CLIENT_ID"]
CLIENT_SECRET = os.environ["CLIO_CLIENT_SECRET"]
REDIRECT_URI = os.getenv("CLIO_REDIRECT_URI", "http://127.0.0.1:8000/callback")
CLIO_BASE = os.getenv("CLIO_BASE", "https://app.clio.com")
API = f"{CLIO_BASE}/api/v4"


# ---------- OAuth ----------

def authorize_url(state: str) -> str:
    q = urlencode({
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "state": state,
    })
    return f"{CLIO_BASE}/oauth/authorize?{q}"


def _save_tokens(tok: dict, old_refresh: str | None = None):
    conn = connect()
    conn.execute(
        "INSERT OR REPLACE INTO oauth_tokens(id, access_token, refresh_token, expires_at) VALUES (1,?,?,?)",
        (tok["access_token"], tok.get("refresh_token") or old_refresh,
         int(time.time()) + int(tok.get("expires_in", 3600)) - 60),
    )
    conn.commit()


def exchange_code(code: str):
    r = requests.post(f"{CLIO_BASE}/oauth/token", data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
    }, timeout=30)
    r.raise_for_status()
    _save_tokens(r.json())


def _refresh(refresh_token: str):
    r = requests.post(f"{CLIO_BASE}/oauth/token", data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }, timeout=30)
    r.raise_for_status()
    _save_tokens(r.json(), old_refresh=refresh_token)


def access_token() -> str:
    row = connect().execute("SELECT * FROM oauth_tokens WHERE id = 1").fetchone()
    if not row:
        raise RuntimeError("Not authorized yet. Run the server and open http://127.0.0.1:8000/login")
    if row["expires_at"] < time.time() and row["refresh_token"]:
        _refresh(row["refresh_token"])
        row = connect().execute("SELECT * FROM oauth_tokens WHERE id = 1").fetchone()
    return row["access_token"]


# ---------- Read-only API ----------

def _session() -> requests.Session:
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {access_token()}"
    return s


def get(path: str, params: dict | None = None) -> dict:
    s = _session()
    for attempt in range(5):
        r = s.get(f"{API}{path}", params=params, timeout=60)
        if r.status_code == 429:  # rate limited: back off
            time.sleep(int(r.headers.get("Retry-After", 2 ** attempt)))
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"Clio GET {path} -> {r.status_code}: {r.text[:500]}")
        return r.json()
    raise RuntimeError(f"Clio GET {path}: rate limited too many times")


def get_all(path: str, params: dict) -> list[dict]:
    """Follow meta.paging.next until exhausted."""
    s = _session()
    url, query, out = f"{API}{path}", {**params, "limit": 200}, []
    while url:
        r = s.get(url, params=query, timeout=60)
        if r.status_code == 429:
            time.sleep(int(r.headers.get("Retry-After", 2)))
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"Clio GET {path} -> {r.status_code}: {r.text[:500]}")
        j = r.json()
        out += j.get("data", [])
        url = j.get("meta", {}).get("paging", {}).get("next")
        query = None  # 'next' already carries the query string
    return out


def download(doc_id: int) -> bytes:
    """Download a document's latest version (Clio redirects to file storage)."""
    r = _session().get(f"{API}/documents/{doc_id}/download.json", timeout=300, allow_redirects=True)
    if r.status_code >= 400:
        raise RuntimeError(f"Download doc {doc_id} -> {r.status_code}: {r.text[:300]}")
    return r.content

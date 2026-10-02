"""Minimal Clio Manage v4 client: token refresh, paging, rate limits, document download.

Run: uv run python -m rag.clio_client
"""
import json
import os
import time

import requests
from dotenv import set_key

from rag import DATA, ENV_PATH, RAW

HOST = os.environ["CLIO_REGION_HOST"]
DOC_FIELDS = "id,name,content_type,size,created_at,updated_at,matter{id,display_number},parent{id,name}"


def _refresh_access_token() -> None:
    """Exchange the (non-expiring) refresh token for a new access token and persist it."""
    resp = requests.post(f"{HOST}/oauth/token", data={
        "grant_type": "refresh_token",
        "refresh_token": os.environ["CLIO_REFRESH_TOKEN"],
        "client_id": os.environ["CLIO_CLIENT_ID"],
        "client_secret": os.environ["CLIO_CLIENT_SECRET"],
    })
    resp.raise_for_status()
    token = resp.json()["access_token"]
    os.environ["CLIO_ACCESS_TOKEN"] = token
    set_key(ENV_PATH, "CLIO_ACCESS_TOKEN", token, quote_mode="never")


def _get(url: str, **kwargs) -> requests.Response:
    """GET with bearer auth; refreshes once on 401 and waits out 429s."""
    refreshed = False
    while True:
        headers = {"Authorization": f"Bearer {os.environ['CLIO_ACCESS_TOKEN']}"}
        resp = requests.get(url, headers=headers, **kwargs)
        if resp.status_code == 401 and not refreshed:
            _refresh_access_token()
            refreshed = True
            continue
        if resp.status_code == 429:
            time.sleep(int(resp.headers.get("Retry-After", 30)))
            continue
        resp.raise_for_status()
        return resp


def list_documents() -> list[dict]:
    """All documents, following meta.paging.next verbatim (Clio rewrites the path)."""
    url = f"{HOST}/api/v4/documents.json"
    params = {"fields": DOC_FIELDS, "limit": 200}
    docs = []
    while url:
        body = _get(url, params=params).json()
        docs += body["data"]
        url = body["meta"]["paging"].get("next")
        params = None  # the next URL already carries every parameter
    return docs


def download(doc_id: int, dest) -> None:
    # Clio answers with a 303 to a pre-signed URL; requests drops the auth header on the cross-host hop.
    resp = _get(f"{HOST}/api/v4/documents/{doc_id}/download.json")
    dest.write_bytes(resp.content)


def sync() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    docs = list_documents()
    for doc in docs:
        dest = RAW / doc["name"]
        if not dest.exists() or dest.stat().st_size == 0:
            download(doc["id"], dest)
            print(f"downloaded {doc['name']}")
    (DATA / "documents.json").write_text(json.dumps(docs, indent=2))
    print(f"{len(docs)} documents in Clio, metadata → data/documents.json")


if __name__ == "__main__":
    sync()

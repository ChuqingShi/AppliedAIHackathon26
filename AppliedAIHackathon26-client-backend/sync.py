"""Incremental, read-only sync of Clio matters into SQLite.

Usage:  python sync.py <matter_id>         # sync one matter by Clio id
        python sync.py --query <case_number> # find a matter by display number / name search
        python sync.py --all                # sync every open matter
        python sync.py --list               # list open matters in Clio
        add --no-files to skip document downloads
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

import clio
from db import connect

load_dotenv()
FILES_DIR = "files"
MATTER_LIST_FIELDS = "id,display_number,description,status,client{id,name}"

# Ask for fields explicitly: without `fields=`, Clio returns little more than id/etag.
FIELDS = {
    "matter": "id,display_number,description,status,open_date,close_date,statute_of_limitations,"
              "created_at,updated_at,client{id,name},practice_area{id,name},matter_stage{id,name},"
              "custom_field_values{id,field_name,value}",
    "relationship": "id,description,contact{id,name}",
    "contact": "id,name,type,first_name,last_name,title,date_of_birth,created_at,updated_at,"
               "email_addresses{name,address},phone_numbers{name,number},"
               "addresses{name,street,city,province,postal_code}",
    "note": "id,subject,detail,date,created_at,updated_at,author{id,name}",
    "communication": "id,type,subject,body,date,created_at,updated_at,senders,receivers",
    "task": "id,name,description,status,priority,due_at,completed_at,created_at,updated_at,assignee{id,name}",
    "calendar_entry": "id,summary,description,location,start_at,end_at,all_day,created_at,updated_at",
    "activity": "id,type,date,quantity,price,total,note,created_at,updated_at",
    "document": "id,name,content_type,received_at,created_at,updated_at,parent{id,name},"
                "latest_document_version{id,size}",
}

ENDPOINTS = {
    "note": ("/notes.json", {"type": "Matter"}),
    "communication": ("/communications.json", {}),
    "task": ("/tasks.json", {}),
    "calendar_entry": ("/calendar_entries.json", {}),
    "activity": ("/activities.json", {}),
    "document": ("/documents.json", {}),
    "relationship": ("/relationships.json", {}),
}


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()


def upsert(conn, kind, rec, matter_id) -> bool:
    """Insert or update a record. Returns True if it is new or changed."""
    h, ts = sha(rec), now()
    prev = conn.execute("SELECT hash FROM raw_records WHERE kind=? AND clio_id=?", (kind, rec["id"])).fetchone()
    if prev and prev["hash"] == h:
        conn.execute("UPDATE raw_records SET synced_at=? WHERE kind=? AND clio_id=?", (ts, kind, rec["id"]))
        return False
    conn.execute(
        """INSERT INTO raw_records(kind, clio_id, matter_id, data, hash, clio_updated_at, synced_at, changed_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(kind, clio_id) DO UPDATE SET data=excluded.data, hash=excluded.hash,
             clio_updated_at=excluded.clio_updated_at, synced_at=excluded.synced_at, changed_at=excluded.changed_at""",
        (kind, rec["id"], matter_id, json.dumps(rec), h, rec.get("updated_at"), ts, ts),
    )
    return True


def list_matters(status: str | None = "open", query: str | None = None) -> list[dict]:
    params = {"fields": MATTER_LIST_FIELDS}
    if status:
        params["status"] = status
    if query:
        params["query"] = query
    return clio.get_all("/matters.json", params)


def find_matter(query: str) -> dict:
    """Resolve a search to exactly one matter; refuse to guess between several."""
    hits = list_matters(status=None, query=query)
    if not hits:
        raise LookupError(f"No matter matching '{query}'")
    exact = [m for m in hits if (m.get("display_number") or "").lower() == query.lower()]
    if len(exact) == 1:
        return exact[0]
    if len(hits) == 1:
        return hits[0]
    options = "; ".join(f"{m['id']} {m.get('display_number')}" for m in hits[:10])
    raise LookupError(f"'{query}' matches {len(hits)} matters, pass a Clio id or display number: {options}")


def _safe_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip() or "unnamed"


def sync(matter_id: int | None = None, query: str | None = None, download_files=True):
    if matter_id is None:
        if not query:
            raise ValueError("Pass a matter_id or a query")
        matter_id = find_matter(query)["id"]
    conn = connect()
    started = now()
    counts, changed = {}, {}

    matter = clio.get(f"/matters/{matter_id}.json", {"fields": FIELDS["matter"]})["data"]
    print(f"Matter: {matter['id']}  {matter.get('display_number')}  {matter.get('description')}")
    changed["matter"] = int(upsert(conn, "matter", matter, matter_id))
    counts["matter"] = 1

    for kind, (path, extra) in ENDPOINTS.items():
        recs = clio.get_all(path, {"matter_id": matter_id, "fields": FIELDS[kind], **extra})
        counts[kind] = len(recs)
        changed[kind] = sum(upsert(conn, kind, r, matter_id) for r in recs)
        print(f"  {kind:15s} {len(recs):4d} records, {changed[kind]} new/changed")

    # Contacts: client + everyone related to the matter
    contact_ids = {matter["client"]["id"]} if matter.get("client") else set()
    for row in conn.execute("SELECT data FROM raw_records WHERE kind='relationship' AND matter_id=?", (matter_id,)):
        c = json.loads(row["data"]).get("contact")
        if c:
            contact_ids.add(c["id"])
    changed["contact"] = 0
    for cid in contact_ids:
        c = clio.get(f"/contacts/{cid}.json", {"fields": FIELDS["contact"]})["data"]
        changed["contact"] += upsert(conn, "contact", c, matter_id)
    counts["contact"] = len(contact_ids)
    print(f"  {'contact':15s} {len(contact_ids):4d} records, {changed['contact']} new/changed")
    conn.commit()

    if download_files:
        matter_dir = os.path.join(FILES_DIR, str(matter_id))
        os.makedirs(matter_dir, exist_ok=True)
        for row in conn.execute("SELECT clio_id, data, hash FROM raw_records WHERE kind='document' AND matter_id=?",
                                (matter_id,)).fetchall():
            have = conn.execute("SELECT hash FROM doc_files WHERE doc_id=?", (row["clio_id"],)).fetchone()
            if have and have["hash"] == row["hash"]:
                continue  # unchanged since last download
            doc = json.loads(row["data"])
            path = os.path.join(matter_dir, f"{doc['id']}__{_safe_name(doc['name'])}")
            print(f"  downloading {doc['name']} ...", flush=True)
            with open(path, "wb") as f:
                f.write(clio.download(doc["id"]))
            conn.execute("INSERT OR REPLACE INTO doc_files(doc_id, path, hash) VALUES (?,?,?)",
                         (doc["id"], path, row["hash"]))
            conn.commit()

    conn.execute("INSERT INTO sync_runs(matter_id, started_at, finished_at, counts) VALUES (?,?,?,?)",
                 (matter_id, started, now(), json.dumps({"counts": counts, "changed": changed})))
    conn.commit()
    print("Done.", json.dumps(counts))
    return {"matter_id": matter_id, "counts": counts, "changed": changed}


def sync_all(download_files=True, status="open"):
    results = []
    for m in list_matters(status=status):
        try:
            results.append(sync(matter_id=m["id"], download_files=download_files))
        except Exception as e:  # one bad matter shouldn't stop the rest
            print(f"  FAILED {m['id']} {m.get('display_number')}: {e}")
            results.append({"matter_id": m["id"], "error": str(e)})
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Read-only sync of Clio matters into SQLite")
    ap.add_argument("matter_id", nargs="?", type=int, help="Clio matter id")
    ap.add_argument("--query", help="search by display number or name")
    ap.add_argument("--all", action="store_true", help="sync every open matter")
    ap.add_argument("--list", action="store_true", help="list open matters and exit")
    ap.add_argument("--no-files", action="store_true", help="skip document downloads")
    args = ap.parse_args()

    if args.list:
        for m in list_matters():
            client = (m.get("client") or {}).get("name", "")
            print(f"{m['id']:>12}  {m.get('display_number', ''):20s}  {client:30s}  {m.get('description', '')}")
    elif args.all:
        sync_all(download_files=not args.no_files)
    elif args.matter_id or args.query:
        try:
            sync(matter_id=args.matter_id, query=args.query, download_files=not args.no_files)
        except LookupError as e:
            sys.exit(str(e))
    else:
        ap.error("pass a matter id, --query, --all, or --list")

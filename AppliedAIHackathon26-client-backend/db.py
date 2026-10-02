"""SQLite storage. All Sapini data lives here, outside Clio (Clio access is read-only)."""
import os
import sqlite3

from dotenv import load_dotenv

load_dotenv()
DB_PATH = os.getenv("DB_PATH", "sapini.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER NOT NULL
);

-- One row per Clio record, stored raw. The hash makes digestion incremental:
-- only rows whose hash changed since the last digest get re-processed.
CREATE TABLE IF NOT EXISTS raw_records (
    kind TEXT NOT NULL,             -- matter, contact, note, communication, task, calendar_entry, activity, document, relationship
    clio_id INTEGER NOT NULL,
    matter_id INTEGER NOT NULL,
    data TEXT NOT NULL,             -- JSON exactly as Clio returned it
    hash TEXT NOT NULL,
    clio_updated_at TEXT,
    synced_at TEXT NOT NULL,
    changed_at TEXT NOT NULL,       -- last time the hash changed (drives "since you last looked")
    PRIMARY KEY (kind, clio_id)
);

-- Downloaded document files and per-page text (text layer or OCR).
CREATE TABLE IF NOT EXISTS doc_files (
    doc_id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    hash TEXT NOT NULL,
    pages INTEGER
);
CREATE TABLE IF NOT EXISTS doc_pages (
    doc_id INTEGER NOT NULL,
    page INTEGER NOT NULL,
    text TEXT,
    method TEXT,                    -- 'text_layer' | 'ocr' | 'pending'
    PRIMARY KEY (doc_id, page)
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matter_id INTEGER,
    started_at TEXT,
    finished_at TEXT,
    counts TEXT
);

-- How each dashboard user arranged their own overview. Kept here rather than in
-- the browser so it follows them to whatever computer they sign in on.
CREATE TABLE IF NOT EXISTS overview_layouts (
    user_id TEXT PRIMARY KEY,       -- the dashboard account (client/src/data/accounts.ts)
    layout TEXT NOT NULL,           -- JSON as the dashboard sent it
    updated_at TEXT NOT NULL
);

-- What the client corrected about their own personal details. Clio is
-- read-only, so their changes are kept here and the dashboard lays them over
-- what Clio has, for the firm and the providers as well as the client.
CREATE TABLE IF NOT EXISTS client_details (
    case_id TEXT PRIMARY KEY,       -- the case's id on the dashboard (the matter's display number)
    details TEXT NOT NULL,          -- JSON as the dashboard sent it
    updated_at TEXT NOT NULL
);

-- What each dashboard user asked the assistant and what it answered, so they can go
-- back over it. One row per message, as the dashboard sent it.
CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,          -- the dashboard account
    case_id TEXT NOT NULL,
    data TEXT NOT NULL,             -- JSON: the message as the dashboard shows it
    at TEXT NOT NULL
);

-- Questions the firm sends to a medical provider or the client when the case doesn't
-- hold the answer, and how far each has got: sent, seen, answered, closed by the firm.
CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,          -- the case's id on the dashboard (the matter's display number)
    asked TEXT,                     -- what was typed in the search box, if that is where it came from
    to_id TEXT NOT NULL,            -- a provider's id on the dashboard, or 'client'
    to_name TEXT NOT NULL,
    from_name TEXT NOT NULL,
    message TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    seen_at TEXT,
    reply TEXT,
    replied_by TEXT,
    replied_at TEXT,
    closed_at TEXT
);

-- Files a medical provider uploaded for the firm from their dashboard (records,
-- bills, letters). Clio is read-only, so they are kept here and in uploads/.
CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,          -- the case's id on the dashboard (the matter's display number)
    provider_id TEXT NOT NULL,      -- the provider's id on the dashboard
    provider_name TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,      -- the person signed in when it was sent
    file_name TEXT NOT NULL,        -- as the provider named it
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    note TEXT,                      -- what it is for, e.g. the request it answers
    path TEXT NOT NULL,             -- where it is saved, under uploads/
    uploaded_at TEXT NOT NULL,
    opened_at TEXT                  -- when the firm first opened it
);
"""


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn

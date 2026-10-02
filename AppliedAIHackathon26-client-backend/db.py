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
"""


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn

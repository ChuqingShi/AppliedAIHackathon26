-- Facts derived from doc_pages. Rebuilt per document whenever doc_files.hash changes.

CREATE TABLE IF NOT EXISTS doc_meta (
    doc_id      INTEGER PRIMARY KEY,
    matter_id   INTEGER NOT NULL,
    hash        TEXT NOT NULL,        -- doc_files.hash this row was built from
    doc_type    TEXT NOT NULL,        -- court_filing | medical_record | medical_bill | intake | other
    stage       TEXT,                 -- Clio folder, e.g. '08 Experts'
    title       TEXT,
    provider    TEXT,
    nyscef_no   INTEGER,
    filed_at    TEXT,                 -- NYSCEF stamp
    authored_at TEXT,                 -- 'Dated:' line / letter date / bill statement date
    doc_date    TEXT,                 -- the date the timeline uses
    date_source TEXT,                 -- nyscef_stamp | dated_line | letter_date | first_visit | statement_date | filename
    summary     TEXT                  -- one rule-built line for the document list and search box
);

CREATE TABLE IF NOT EXISTS medical_visits (
    doc_id      INTEGER NOT NULL,
    page        INTEGER NOT NULL,
    provider    TEXT,
    visit_date  TEXT,
    title       TEXT,
    work_status TEXT,
    recovery    TEXT NOT NULL,        -- resolved | discharged | plateau | not_recovered | improving | diagnostic | unknown
    evidence    TEXT,                 -- the sentence the category was read from
    PRIMARY KEY (doc_id, page)
);

CREATE TABLE IF NOT EXISTS recovery_evidence (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id    INTEGER NOT NULL,
    page      INTEGER NOT NULL,
    author    TEXT,                   -- expert, e.g. 'Hostin'
    side      TEXT,                   -- defense | plaintiff
    recovery  TEXT NOT NULL,          -- resolved | plateau | permanent | causation | ...
    quote     TEXT NOT NULL,
    doc_date  TEXT
);

CREATE TABLE IF NOT EXISTS bill_lines (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id         INTEGER NOT NULL,
    page           INTEGER NOT NULL,
    provider       TEXT,
    statement_date TEXT,
    service_date   TEXT NOT NULL,
    description    TEXT NOT NULL,
    amount_cents   INTEGER NOT NULL   -- integer cents: exact sums, no float rounding
);

-- Full-text index over doc_pages for the search box (digest/search.py). `name` is the
-- document's file name, so a question that names a document finds its pages. The triggers
-- keep it in step with doc_pages; the last statement fills it for pages extracted before
-- the index existed.
CREATE VIRTUAL TABLE IF NOT EXISTS doc_pages_fts USING fts5(
    name, text, doc_id UNINDEXED, page UNINDEXED, tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS doc_pages_fts_add AFTER INSERT ON doc_pages BEGIN
    INSERT INTO doc_pages_fts(name, text, doc_id, page)
    VALUES ((SELECT json_extract(data, '$.name') FROM raw_records WHERE kind = 'document' AND clio_id = new.doc_id),
            new.text, new.doc_id, new.page);
END;

CREATE TRIGGER IF NOT EXISTS doc_pages_fts_remove AFTER DELETE ON doc_pages BEGIN
    DELETE FROM doc_pages_fts WHERE doc_id = old.doc_id AND page = old.page;
END;

INSERT INTO doc_pages_fts(name, text, doc_id, page)
SELECT (SELECT json_extract(data, '$.name') FROM raw_records WHERE kind = 'document' AND clio_id = p.doc_id),
       p.text, p.doc_id, p.page
FROM doc_pages p WHERE NOT EXISTS (SELECT 1 FROM doc_pages_fts);

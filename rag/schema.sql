create extension if not exists vector;

create table if not exists documents (
    id               bigint primary key,      -- Clio document id
    file_name        text not null,
    matter           text,
    stage            text,                    -- Clio folder, e.g. '02 Pleadings'
    doc_type         text not null,           -- court_filing | medical_record | medical_bill | intake
    title            text,
    provider         text,
    nyscef_no        int,
    filed_at         date,                    -- NYSCEF stamp
    authored_at      date,                    -- 'Dated:' line / letter date / bill statement date
    doc_date         date,                    -- the date the timeline uses
    date_source      text,                    -- where doc_date came from
    page_count       int,
    clio_uploaded_at timestamptz              -- upload time only, not a document date
);

create table if not exists chunks (
    id              text primary key,         -- '<document_id>:<n>'
    document_id     bigint not null references documents(id) on delete cascade,
    parent_id       text references chunks(id),
    chunk_type      text not null,            -- passage | visit | bill_summary | section (parent, not embedded)
    section         text,
    page_start      int,
    page_end        int,
    event_date      date,                     -- visit date for medical records
    mentioned_dates date[],
    context_header  text not null,
    text            text not null,
    embedding       vector(384),              -- null for parent sections
    tsv             tsvector generated always as (to_tsvector('english', context_header || ' ' || text)) stored
);

create table if not exists bill_lines (
    id             serial primary key,
    document_id    bigint not null references documents(id) on delete cascade,
    provider       text,
    statement_date date,
    service_date   date not null,
    description    text not null,
    amount         numeric(10, 2) not null,
    page_no        int
);

create index if not exists chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_tsv_idx on chunks using gin (tsv);
create index if not exists chunks_event_date_idx on chunks (event_date);
create index if not exists documents_doc_date_idx on documents (doc_date);

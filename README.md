# AppliedAIHackathon26
Law Di Gras 2026

> **⚠️ Deprecated — not used. Do not merge this branch into `main`.**
> This branch keeps a working RAG (search) pipeline for reference only. The team decided not to use it:
> lawyers told us they don't need search over every file, mainly whether the client has recovered and who
> says so. That is now done with plain rules in `AppliedAIHackathon26-client-backend/digest/` on `main`.

## What this was
A hybrid search pipeline over the Clio PDFs, in `rag/`:
1. `clio_client.py` downloads the documents from Clio (replaced by the backend's `sync.py`).
2. `extract.py` reads each page (text layer, tesseract OCR for scans).
3. `build.py` dates each document and splits it into chunks by type: numbered paragraphs for court
   filings, one chunk per visit for medical records, bill lines as rows.
4. `load.py` embeds the chunks with a local model (`BAAI/bge-small-en-v1.5`) into Postgres + pgvector.
5. `search.py` answers a question with vector search plus keyword search, merged by rank.

Background on the chunking choices: `docs/chunking-strategies.md`.

## Running it (if ever needed)
Needs Docker, `uv`, tesseract, and the Clio keys in a root `.env` (plus `DATABASE_URL=postgresql://rag:rag@localhost:5433/rag`).
```bash
docker compose up -d
uv run python -m rag.clio_client
uv run python -m rag.extract
uv run python -m rag.build
uv run python -m rag.load
uv run python -m rag.search "letter asking the judge for a preliminary conference"
uv run pytest
```

# AppliedAIHackathon26
Law Di Gras 2026

## Document digest: what the medical records say

Reads the documents synced from Clio and pulls out the facts lawyers asked for, mainly **whether the client has recovered and who says so**. It uses plain rules (no AI model, no search index), and every fact comes with the page it was read from.

Code lives in `AppliedAIHackathon26-client-backend/digest/` and writes to the same `sapini.db` as the Clio sync.

## Why
Lawyers told us they don't need search over every file. From the medical records they mainly want to
know **whether the patient has recovered, and who says so**. The digest therefore pulls a few facts out
of the synced PDFs with plain rules (no LLM, no vector search) and adds them to what the backend already
serves. Each fact carries the page it came from, so it can be checked in one click.

## What this adds
The Clio sync already downloads every document and knows what Clio's fields say. The digest adds what the **documents themselves** say:
- **Page text** for every document, including scanned pages, stored in `doc_pages` (the table existed but was empty).
- **Real document dates** from the court filing stamp, the "Dated:" line, letter dates, visit dates and bill statement dates. Clio only has the upload time.
- **Recovery status** per treating provider (latest visit, work status) and the defense experts' conclusions, each with a quote and page. Before, this came only from a hand-typed Clio field.
- **Every bill line** from the itemized bills with exact totals ($118,400.00 across 9 providers), which can be checked against the firm's own tally note.
- **Three new endpoints** and a few extra fields on `/case` (below). Existing endpoints and fields are unchanged.
- **Tests** for all of the above (`pytest`).

## Setup
First get the backend running and sync the matter (see `AppliedAIHackathon26-client-backend/README.md`). Then, from `AppliedAIHackathon26-client-backend/`:
```bash
brew install tesseract              # reads scanned pages (Windows: install Tesseract OCR and add it to PATH)
pip install -r requirements.txt     # now includes pymupdf and pytest
python sync.py --query 00001-Sapini # skip if already synced
python -m digest                    # reads every downloaded document
```
1. Start the server: `uvicorn main:app --host 127.0.0.1 --port 8000`
2. Open **http://127.0.0.1:8000/case/recovery**. You should see the recovery status per provider and per expert.

Run `python -m digest` again after every sync. It only re-reads documents that changed. Add `--force` to re-read everything (e.g. after changing a rule).

## Endpoints
- `GET /case/recovery`: latest status from each treating provider, plus the defense experts' conclusions. Each item has a quote, `doc_id` and page.
- `GET /case/bills`: every charge line from the itemized bills, with exact totals per provider.
- `GET /case/timeline`: documents ordered by their real date (court filing stamp, letter date, visit or bill date), not by Clio upload time.
- `GET /case` now also has a `recovery` key, and each document has `docDate` and a one-line `summary`. Nothing that was already there changed. Providers never see `recovery`.

Open the source page with `GET /documents/{doc_id}`.

## Example
```
Advanced Rockland Chiropractic (last visit 2024-08-15): not recovered
Defense expert Hostin (2026-04-09): no traumatic injury, resolved, plateaued, able to work
Defense expert Tsao (2026-03-24): resolved, able to work
Defense expert Katzman (2026-02-04): no traumatic injury
```

## How it works
1. `digest/extract.py` puts each page's text into `doc_pages` (scanned pages go through OCR).
2. `digest/parse.py` works out each document's type and real date.
3. `digest/medical.py` reads each visit's status from fixed phrases, e.g. "continue care" → not recovered, "discharge from physical therapy" → discharged. Expert reports are scanned for "resolved", "plateaued", "able to work", "no traumatic injury".
4. `digest/bills.py` reads each charge line exactly. Totals are added up in the database, never estimated.

Results go into four tables: `doc_meta`, `medical_visits`, `recovery_evidence`, `bill_lines`.

## Tests
```bash
pytest
```

## Not included
Full-text search over documents and AI summaries. A working search version is archived (deprecated) on the `feature/rag_pdfsearch-archived` branch if we need it later. Don't merge that branch into `main`.

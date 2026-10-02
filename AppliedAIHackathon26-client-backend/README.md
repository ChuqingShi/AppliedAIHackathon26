# Sapini backend: Clio sync

Reads the Sapini matter **live and read-only** from Clio Manage (GET requests only; the OAuth app has read scopes only) into SQLite, which is where all data lives outside Clio.

## Setup
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # paste App Key + App Secret from developers.clio.com/apps
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
1. Open **http://127.0.0.1:8000/login** (not localhost) and approve the app.
2. You land on `/me`, which should show your Clio user.
3. Pick a matter: `python sync.py --list` (or `GET /matters`).
4. Sync it, by Clio id or display number, or sync every open matter:
   ```bash
   python sync.py <matter_id>           # POST /sync?matter_id=<matter_id>
   python sync.py --query <case_number>  # POST /sync?query=<case_number>
   python sync.py --all                 # POST /sync?all=true
   ```
   Add `--no-files` (API: `files=false`) to skip document downloads. Files go to `files/<matter_id>/`.


## How it stays incremental
Every record is stored raw with a SHA-256 hash. Unchanged records are skipped, `changed_at` moves only when the content actually changed, and documents are only re-downloaded when their metadata changes. Later digestion steps only process changed rows.

## Dashboard endpoints
The CaseBoard client (`../client`) reads everything from these; nothing on the dashboard is hardcoded.

- `GET /case?matter_id=`: the digested case record the law firm sees (defaults to the latest synced matter). Built by `case_view.py` from SQLite; fields Clio doesn't hold come back as `null` and the cards hide them.
- `GET /case/provider?matter_id=&provider_id=`: the trimmed record one medical provider may see.
- `GET /documents/{doc_id}`: a synced document file.
- `GET /cases`: matters synced so far.
- `GET` / `PUT /users/{user_id}/overview`: how one dashboard user arranged their overview (`null` until they change it). Stored in the `overview_layouts` table, so it follows them to any computer they sign in on.

Optional: set `FIRM_NAME` in `.env` to name the firm on the dashboard (Clio's matter data doesn't include it).

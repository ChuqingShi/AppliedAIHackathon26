# CaseBoard

Law Di Gras 2026, Applied AI Hackathon.

A live dashboard for one personal-injury case. It reads the matter from Clio Manage, digests it, and shows each person on the case what they need to know: the law firm's team, the medical providers treating the client, and the client.

It is one dashboard, not three apps. Who is signed in decides which views exist and which data their browser receives.

| Signed in as | Sees |
| --- | --- |
| The law firm | Everything: what needs attention, where the case is, the money, to-dos, documents, the client, providers, updates |
| A medical provider | Case status, their own bills and records, what the firm needs from them. Never strategy, settlement numbers or other providers' files |
| The client | The personal details the firm holds on them (which they can correct), their incident and injuries, who is working on their case |

## What it does

**For the firm**

- **Overview in one screen.** "Needs attention" leads (overdue to-dos, to-dos due this week, providers the firm is waiting on, the statute of limitations, new answers). Under it: where the case is, the money at a glance, to-dos and the latest updates.
- **A briefing on sign-in.** A short catch-up pops up over the overview; it is built from the case, not typed in.
- **Search the documents, not just their names.** The search box lists the pages of the case's PDFs that say what was typed. Each result opens the document at that page.
- **Ask about the case.** The assistant answers from the case record, the facts read out of the documents and the matching pages, and links each answer to the pages it came from.
- **Ask someone when the case can't answer.** If the case doesn't hold the answer, the assistant says so and drafts a message to whoever would know (a provider or the client). The firm edits and sends it, then tracks it: sent, seen, answered.
- **The client's picture.** If the matter has a photo ID on file, the portrait is cut from it and shown with the client.
- **An overview each user arranges.** Tiles can be added, removed, moved, resized and locked; the layout is saved per user.

**For a medical provider**

- How the case is going and its status updates, without the firm's notes.
- Their own records and bill, and "needed from you".
- Questions from the legal team, answered on the card. The firm sees when a question was seen and answered.

**For the client**

- Their own details, which they can correct. The firm and the providers see the corrections; Clio is not changed.
- Questions from the legal team, answered the same way.

## Where to look first

| File | What it shows |
| --- | --- |
| `AppliedAIHackathon26-client-backend/case_view.py` | How the raw Clio records become the case the dashboard shows |
| `AppliedAIHackathon26-client-backend/digest/` | How facts are read out of the PDFs, each with its page |
| `client/src/data/case.ts` | `forProvider()` and `forClient()`: the whitelists that decide what the other two roles receive |
| `client/src/lib/dashboard.ts` | The one place data enters the frontend, built per role on the server |
| `client/src/lib/assistant.ts` | The only model call in the project |

## How it works

```
Clio Manage (read-only)
   |  sync.py: GET requests only
   v
sapini.db (SQLite) + files/ (the downloaded documents)
   |  python -m digest: page text, document dates, recovery status, bill lines, search index
   v
FastAPI: GET /case, /case/search, /case/recovery, /case/bills, /case/timeline, /documents/{id}
   |
   v
Next.js server: builds only the record the signed-in role may see
   |
   v
The browser
```

- **Clio is read-only.** The backend only sends GET requests to Clio, plus the OAuth token exchange. Nothing is written back.
- **Nothing on the dashboard is a sample.** There is no fallback case. If the backend is down or nothing is synced, every page says how to fix it.
- **Trimming happens on the server.** `src/data/case.ts` and `src/lib/*` are server-only, so the full case record never reaches a provider's or the client's browser.
- **The dashboard shows the last sync.** Re-run the sync to pick up changes in Clio; it only re-processes records that changed.

## Run it

You need Python 3, Node.js, and a Clio app key and secret (developers.clio.com/apps).

**1. Backend**

```bash
cd AppliedAIHackathon26-client-backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # paste the Clio app key and secret
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Open **http://127.0.0.1:8000/login** (not `localhost`) once and approve the app in Clio. Then sync the matter and read its documents:

```bash
python sync.py --query 00001-Sapini    # or: python sync.py <matter_id>
python -m digest                       # run again after every sync
```

Scanned pages need `tesseract` on the PATH (`apt install tesseract-ocr`, or `brew install tesseract`). Without it they are left unread and everything else still works; once it is installed, run `python -m digest --force`.

**2. Frontend**

```bash
cd client
npm install
npm run dev        # http://localhost:3000
```

Sign in by picking an account: the firm user, any provider on the matter, or the client. The accounts are built from the synced matter.

**3. Optional settings**

| Setting | Where | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | `client/.env.local` | Lets Claude answer in the assistant. Without it, keyword rules answer instead |
| `SAPINI_API_URL` | `client/.env.local` | Where the backend is (default `http://127.0.0.1:8000`) |
| `SAPINI_MATTER_ID` | `client/.env.local` | Which matter to show (default: the one synced last) |
| `FIRM_NAME` | backend `.env` | The firm's name on the dashboard (default "Law firm") |

More detail is in `AppliedAIHackathon26-client-backend/README.md` and `client/README.md`.

## Tech stack

| Part | Built with |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Backend | Python, FastAPI, SQLite |
| Document reading | PyMuPDF for page text, Tesseract for scanned pages, OpenCV for the portrait on a photo ID |
| Search | SQLite FTS5 (full-text, ranked by BM25) |
| Model | Claude Opus 5.5 through the Anthropic SDK, in the assistant only |
| Runs on | A laptop: the backend on `127.0.0.1:8000`, the frontend on `localhost:3000` |

### Where data lives outside Clio

Everything is in one local SQLite file, `sapini.db`, plus the downloaded documents in `files/`. Both are gitignored, and so is `.env`.

| Tables | Hold |
| --- | --- |
| `raw_records`, `doc_files`, `sync_runs`, `oauth_tokens` | The matter as synced from Clio, each record with a hash so unchanged records are skipped |
| `doc_pages`, `doc_pages_fts` | The text of every document page, and the search index over it |
| `doc_meta`, `medical_visits`, `recovery_evidence`, `bill_lines` | What the digest read out of the documents |
| `overview_layouts`, `client_details`, `inquiries` | What users change on the dashboard: their layout, the client's corrections, questions and answers |

## AI models and cost per case

**Digesting a case uses no model and costs nothing to run.** The sync, the case view, the document digest and the search are plain rules and SQL. They run once per sync and store the result, so opening the dashboard never re-digests the case.

**The assistant is the only model call.** It uses Claude Opus 5.5 (`claude-opus-5-5`), once per question, and only when someone at the firm asks. Each call sends:

- the case record and the digest's facts, about 25,000 tokens, cached between questions;
- the twelve best-matching document pages and the question, about 10,000 tokens;
- and gets back a short answer and a draft message, under 1,000 tokens.

At $4 per million input tokens, $20 per million output tokens and $0.20 per million cached tokens read, that is about **$0.20 for the first question and about $0.07 for each one after it** while the cache is warm. Ten questions on a case is roughly $1 to $2. These figures are estimated from the size of what is sent for the Sapini matter, not measured from a bill.

If Claude declines a question, the request falls back to another model on the server. If there is no API key or the API can't be reached, keyword rules answer from the same material.

## What is generated, and what is not

**Read from Clio at run time:** the client, the incident, injuries, providers and their bills, the insurer, case value and policy limit, liens, costs, to-dos, documents, updates, the legal team, the current stage, the dates and the statute of limitations. Much of it is read out of free-text notes and custom fields. A field Clio doesn't hold comes back empty and its card hides it.

**Fixed in the code:**

- The names of the eight case stages. Which stage the case is in comes from Clio's matter stage.
- The one-third fee share used in the settlement breakdown.
- The phrases the digest looks for in medical records ("continue care", "discharge from physical therapy" and so on).
- The suggested questions in the search box, and the three one-click replies a provider can start an answer from.
- What a provider may see. It is a fixed whitelist; attorneys can't yet adjust it per provider.

**Half-done:**

- Sign-in is a demo account picker with no passwords. The backend's own endpoints have no sign-in; the frontend's server enforces the roles.
- Nothing re-syncs on its own. The dashboard is as fresh as the last sync.
- Call and Upload only show a toast. A message from a provider or the client to the firm also only shows a toast; questions from the firm are real.
- Clio has no structured offer, demand or target range for this matter, so those cards stay hidden.
- The digest's recovery status, document dates and bill lines are served by the API and read by the assistant, but have no card of their own yet.
- The sign-in briefing is built by rules, not written by a model.

## Document digest

`AppliedAIHackathon26-client-backend/digest/` reads the documents synced from Clio and pulls out the facts lawyers asked for, mainly **whether the client has recovered and who says so**. Every fact carries the document and page it was read from, so it can be checked in one click.

1. `extract.py` puts each page's text into `doc_pages`. Scanned pages go through OCR.
2. `parse.py` works out each document's type and its real date (the court filing stamp, the "Dated:" line, a visit or statement date). Clio only has the upload time.
3. `medical.py` reads each visit's status from fixed phrases, and scans expert reports for their conclusions.
4. `bills.py` reads each charge line exactly. Totals are added up in the database, never estimated.
5. `search.py` answers `GET /case/search` from the full-text index.

| Endpoint | Returns |
| --- | --- |
| `GET /case/recovery` | The latest status from each treating provider and each expert's conclusions, with a quote, document and page |
| `GET /case/bills` | Every charge line from the itemized bills, with exact totals per provider |
| `GET /case/timeline` | The documents ordered by their real date |
| `GET /case/search?q=` | The pages that best match a question, with the matching passage |
| `GET /documents/{doc_id}` | The document itself |

An earlier search pipeline is archived on the `feature/rag_pdfsearch-archived` branch. It is deprecated; don't merge it into `main`.

## Tests

```bash
cd AppliedAIHackathon26-client-backend && pytest    # the digest and the search
cd client && npm run lint && npm run build
```

## License

MIT. See `LICENSE`.

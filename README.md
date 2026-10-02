# CaseBoard

Law Di Gras 2026, Applied AI Hackathon.

A live dashboard for one personal-injury case. It reads the matter from Clio Manage (read-only), digests the case file, and shows each person on the case what they need to know: the law firm's team, the medical providers treating the client, and the client.

It is one dashboard, not three apps. Who is signed in decides which views exist and which data their browser receives.

| Signed in as | Sees |
| --- | --- |
| The law firm | Everything: what needs attention, where the case is, the money, to-dos, documents, the client, providers, updates, questions sent out |
| A medical provider | Case status, their own bills and records, what the firm needs from them, questions from the firm. Never strategy, settlement numbers or other providers' files |
| The client | The personal details the firm holds on them (which they can correct), their incident and injuries, who is working on their case, questions from the firm |

**Contents:** [Quick start](#quick-start) · [Setup in detail](#setup-in-detail) · [Using the dashboard](#using-the-dashboard) · [Day-to-day](#day-to-day-re-syncing-switching-matters-resetting) · [Troubleshooting](#troubleshooting) · [How it works](#how-it-works) · [Configuration](#configuration-reference) · [API](#backend-api) · [Project layout](#project-layout) · [Tests](#tests) · [Limits](#what-is-real-what-is-fixed-and-what-is-not-done) · [Cost](#ai-models-and-cost-per-case)

---

## Quick start

Two processes run on your laptop: a Python backend on port 8000 and a Next.js frontend on port 3000. You need **Python 3.10+**, **Node.js 20+**, and a **Clio Manage account** you can register an API app in.

```bash
git clone https://github.com/ChuqingShi/AppliedAIHackathon26.git
cd AppliedAIHackathon26

# 1. Backend: Clio sync + document digest + API
cd AppliedAIHackathon26-client-backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # then paste your Clio app key and secret into it
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Open **http://127.0.0.1:8000/login** in a browser (use `127.0.0.1`, not `localhost`) and approve the app in Clio. Then, in a second terminal with the same venv active:

```bash
cd AppliedAIHackathon26-client-backend
python sync.py --list                  # see your open matters
python sync.py --query 00001-Sapini    # sync one matter (or: python sync.py <matter_id>)
python -m digest                       # read the documents; run again after every sync
```

```bash
# 2. Frontend
cd ../client
npm install
npm run dev                            # http://localhost:3000
```

Open **http://localhost:3000**, pick an account on the sign-in page, and you're on the dashboard. Everything on it comes from the matter you just synced.

Optional, for the AI assistant: put `ANTHROPIC_API_KEY=sk-ant-...` in `client/.env.local` and restart `npm run dev`. Without it the assistant still answers, using keyword rules over the same material.

---

## Setup in detail

### Prerequisites

| Need | Why | Check |
| --- | --- | --- |
| Python 3.10 or newer (developed on 3.13) | The backend: FastAPI, the Clio sync, the document digest | `python3 --version` |
| Node.js 20.9 or newer (developed on 22) | The frontend: Next.js 16 | `node --version` |
| A Clio Manage account with developer access | The case data. Nothing is bundled; the dashboard has no sample case | Sign in at app.clio.com |
| Tesseract (optional) | OCR for scanned PDF pages. Without it, scanned pages are skipped and everything else works | `tesseract --version` |

Install Tesseract with `sudo apt install tesseract-ocr` (Debian/Ubuntu), `brew install tesseract` (macOS), or the Windows installer from the Tesseract project. If you add it after the first digest, run `python -m digest --force` to go back and read the skipped pages.

### Step 1: Register a Clio app

1. Go to **https://developers.clio.com/apps** (or **Settings → Developer Portal** inside Clio) and create an application.
2. Set the **redirect URI** to exactly `http://127.0.0.1:8000/callback`.
3. Copy the **App Key** and **App Secret**. You'll paste them into the backend's `.env` next.

The backend only ever sends GET requests to Clio (plus the OAuth token exchange); it never writes to your Clio data.

### Step 2: Backend

All backend commands run from inside `AppliedAIHackathon26-client-backend/`, because the `.env` file and the database are read from the current directory.

```bash
cd AppliedAIHackathon26-client-backend
python -m venv .venv
source .venv/bin/activate            # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```ini
CLIO_CLIENT_ID=your_app_key
CLIO_CLIENT_SECRET=your_app_secret
CLIO_REDIRECT_URI=http://127.0.0.1:8000/callback
CLIO_BASE=https://app.clio.com       # change if your Clio account is in another region
DB_PATH=sapini.db
FIRM_NAME=Your Firm Name             # optional: shown on the dashboard; Clio doesn't hold it
```

Start the API:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Leave it running. It creates `sapini.db` (SQLite) on first start.

### Step 3: Authorize with Clio

1. Open **http://127.0.0.1:8000/login** in a browser. Use `127.0.0.1`, not `localhost`: the redirect URI must match the one registered in Clio character for character.
2. Approve the app. You land on `/me`, which shows your Clio user as JSON. That means the token is stored and the backend can read your matters.

You only do this once; the backend refreshes the token itself.

### Step 4: Sync a matter and read its documents

In a second terminal (same folder, same venv):

```bash
python sync.py --list                    # every open matter, with its id and display number
python sync.py --query 00001-Sapini      # sync by display number or name
python sync.py 12345678                  # ...or by Clio matter id
python sync.py --all                     # ...or every open matter
```

The sync pulls the matter (with its client, custom fields and stage), its notes, communications, tasks, calendar entries, activities, relationships and documents into SQLite, and downloads the document files into `files/<matter_id>/`. Add `--no-files` to skip the downloads. Re-running the sync is cheap: records are hashed and only changed ones are re-processed.

Then digest the documents:

```bash
python -m digest             # reads every page, works out document dates, recovery status, bill lines, and builds the search index
python -m digest --force     # re-reads everything, e.g. after installing Tesseract
```

Run `python -m digest` after **every** sync; the dashboard's search and assistant read from what the digest produced.

Quick check: `curl http://127.0.0.1:8000/case` should return a large JSON record of the case.

### Step 5: Frontend

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:3000**. If the backend isn't reachable or nothing has been synced yet, the page says so and tells you which step to go back to; there is no sample data to fall back on.

Optional settings go in `client/.env.local` (create it; it's gitignored). Restart `npm run dev` after changing it.

```ini
ANTHROPIC_API_KEY=sk-ant-...           # lets Claude answer in the assistant
SAPINI_API_URL=http://127.0.0.1:8000   # where the backend is (this is the default)
SAPINI_MATTER_ID=12345678              # which matter to show (default: the one synced most recently)
```

### Step 6: Sign in

The sign-in page lists a demo account for everyone on the case, built from the synced matter: the firm user, each medical provider, and the client. There are no passwords; this is a hackathon demo. Pick one and you're in. The sidebar has a **Demo · signed in as** switch to jump between roles without going back to the sign-in page.

---

## Using the dashboard

### As the law firm

**Overview.** The first screen. *Needs attention* leads: overdue to-dos, to-dos due this week, providers the firm is waiting on, the statute of limitations, and new answers to questions you sent. Under it: where the case is in its eight stages, the money at a glance, to-dos, and the latest updates.

**The briefing.** On sign-in a short catch-up pops up over the overview. It's built from the case record by rules, so it's always current with the last sync.

**Arrange your overview.** Tiles can be added, removed, moved, resized and locked. The layout is saved under your account in the backend, so it follows you to any computer.

**Search the documents.** The search box at the top searches the *text* of every PDF page, not just file names. Each result shows the matching passage and opens the document at that page.

**Ask about the case.** Type a question in the same box (e.g. "Has the client been discharged from physical therapy?" or "What do the chiropractor's bills add up to?"). The assistant answers from the case record, the facts the digest read out of the documents, and the best-matching pages, and links each answer to the pages it came from. With `ANTHROPIC_API_KEY` set, Claude writes the answer; otherwise keyword rules do.

**Ask someone when the case can't answer.** If the answer isn't in the case, the assistant says so and drafts a message to whoever would know, a provider or the client. Edit it, send it, and it shows up on their dashboard. Track it under **Questions sent**: sent → seen → answered. New answers surface in *Needs attention*.

**Your history.** The clock button in the search box opens everything you've asked, searchable, each opening to its answer with an "Ask again". It's kept under your account; there's a button to clear it.

**The other views.** *Financials* (case value, policy limit, liens, costs, the settlement breakdown), *Client* (details, incident, injuries, with the portrait cut from the photo ID if one is on file), *Documents*, *To-do*, *Medical providers* (each provider, their bills, what's outstanding, and files they've uploaded), *Updates*.

### As a medical provider

- **Overview**: how the case is going, without the firm's notes or numbers.
- **Patient & injuries**: who the patient is and what they're being treated for.
- **Records & bills**: this provider's own records and bill, and *Needed from you*. Each item has an **Upload** button; the file goes to the firm and appears on the firm's providers view. Nothing goes to Clio.
- **Case progress**, **Legal team**: status updates and who to contact.
- **Questions for you**: questions the firm sent. Answer on the card (there are three one-click starters); the firm sees when it was seen and answered.

### As the client

- **Overview**: their incident, injuries, who is working on their case.
- **My information**: the personal details the firm holds. The client can correct them here; the firm and providers see the corrections on their dashboards. Clio is not changed.
- **Questions for you**: questions from the firm, answered the same way as a provider.

---

## Day-to-day: re-syncing, switching matters, resetting

| Want to | Do |
| --- | --- |
| Pick up changes made in Clio | `python sync.py --query <matter>` then `python -m digest`. The dashboard shows the time of the last sync. Nothing re-syncs on its own |
| Show a different matter | Sync it, then either set `SAPINI_MATTER_ID` in `client/.env.local` or rely on the default (the matter synced most recently) |
| Re-read documents after installing Tesseract | `python -m digest --force` |
| Start over with a clean database | Stop the backend, delete `sapini.db` and `files/`, start it, then redo Steps 3 and 4 |
| Clear a user's assistant history | The clear button in the history panel, or `DELETE /users/{user_id}/chat?case_id=...` |
| Re-authorize with Clio | Open http://127.0.0.1:8000/login again |

Everything outside Clio lives in two gitignored places: `sapini.db` and `files/`. Deleting them loses users' saved layouts, the client's corrections, questions and answers, uploads, and chat history, but nothing in Clio.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `KeyError: 'CLIO_CLIENT_ID'` when starting uvicorn | `.env` is missing or you're not in `AppliedAIHackathon26-client-backend/`. Copy `.env.example` to `.env` and run from that folder |
| Clio says the redirect URI is invalid | The app's redirect URI in Clio must be exactly `http://127.0.0.1:8000/callback`, and you must open `/login` via `127.0.0.1`, not `localhost` |
| `/me` returns 401 or the sync says not authorized | Redo Step 3 (`/login`). If your account is in another Clio region, set `CLIO_BASE` in `.env` |
| `sync.py --list` shows nothing | The Clio user you authorized has no open matters it can see |
| The dashboard says it can't reach the backend | Start uvicorn, or point `SAPINI_API_URL` in `client/.env.local` at it |
| The dashboard says nothing is synced | Run `python sync.py ...` then `python -m digest` |
| Search finds nothing / assistant says the documents are empty | You skipped `python -m digest`, or the PDFs are scans and Tesseract isn't installed |
| Cards are blank or hidden | Clio doesn't hold that field for this matter (e.g. no structured offer/demand). The card hides itself rather than invent a value |
| The assistant answers tersely without citations | No `ANTHROPIC_API_KEY`, or the API can't be reached, so keyword rules are answering. Set the key in `client/.env.local` and restart `npm run dev` |
| `npm run dev` complains about the Node version | Next.js 16 needs Node 20.9+ |
| `next dev` created `AGENTS.md`/`CLAUDE.md` inside `client/` | Expected when an AI coding agent runs it; they're gitignored. Delete them, don't commit them. The real ones live at the repo root |

---

## How it works

```
Clio Manage (read-only)
   |  sync.py: GET requests only, each record hashed so unchanged ones are skipped
   v
sapini.db (SQLite) + files/ (the downloaded documents)
   |  python -m digest: page text (+OCR), document dates, recovery status, bill lines, FTS5 search index
   v
FastAPI on 127.0.0.1:8000: /case, /case/search, /case/recovery, /case/bills, /case/timeline, /documents/{id}, ...
   |
   v
Next.js server on localhost:3000: builds only the record the signed-in role may see
   |
   v
The browser
```

- **Clio is read-only.** The backend only sends GET requests to Clio, plus the OAuth token exchange. Nothing is written back; the client's corrections, uploads, questions and layouts live in SQLite.
- **Nothing on the dashboard is a sample.** There is no fallback case. If the backend is down or nothing is synced, every page says how to fix it.
- **Trimming happens on the server.** `client/src/data/case.ts` and `client/src/lib/*` are server-only. `forProvider()` and `forClient()` are whitelists, so the full case record never reaches a provider's or the client's browser.
- **Digesting uses no model.** The sync, case view, digest and search are rules and SQL, run once per sync and stored. Opening the dashboard never re-digests the case. The assistant is the only model call in the project.
- **The dashboard is as fresh as the last sync.**

### Document digest

`AppliedAIHackathon26-client-backend/digest/` reads the documents synced from Clio and pulls out the facts lawyers asked for, mainly **whether the client has recovered and who says so**. Every fact carries the document and page it was read from, so it can be checked in one click.

1. `extract.py` puts each page's text into `doc_pages`. Scanned pages go through Tesseract.
2. `parse.py` works out each document's type and its real date (the court filing stamp, the "Dated:" line, a visit or statement date). Clio only has the upload time.
3. `medical.py` reads each visit's status from fixed phrases ("continue care", "discharged from physical therapy", ...), and scans expert reports for their conclusions.
4. `bills.py` reads each charge line exactly. Totals are added up in the database, never estimated.
5. `search.py` answers `GET /case/search` from the FTS5 index, ranked by BM25.

An earlier search pipeline is archived on the `feature/rag_pdfsearch-archived` branch. It is deprecated; don't merge it into `main`.

### Where to look first (for reviewers)

| File | What it shows |
| --- | --- |
| `AppliedAIHackathon26-client-backend/case_view.py` | How the raw Clio records become the case the dashboard shows |
| `AppliedAIHackathon26-client-backend/digest/` | How facts are read out of the PDFs, each with its page |
| `client/src/data/case.ts` | `forProvider()` and `forClient()`: the whitelists that decide what the other two roles receive |
| `client/src/lib/dashboard.ts` | The one place data enters the frontend, built per role on the server |
| `client/src/lib/assistant.ts` | The only model call in the project |

---

## Configuration reference

**Backend** (`AppliedAIHackathon26-client-backend/.env`, loaded from the current directory)

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `CLIO_CLIENT_ID` | yes | | The Clio app key |
| `CLIO_CLIENT_SECRET` | yes | | The Clio app secret |
| `CLIO_REDIRECT_URI` | no | `http://127.0.0.1:8000/callback` | Must match the app's redirect URI in Clio |
| `CLIO_BASE` | no | `https://app.clio.com` | Clio's base URL; change for other regions |
| `DB_PATH` | no | `sapini.db` | Where the SQLite database lives |
| `FIRM_NAME` | no | `Law firm` | The firm's name on the dashboard |

**Frontend** (`client/.env.local`)

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | no | | Lets Claude answer in the assistant. Without it, keyword rules answer |
| `SAPINI_API_URL` | no | `http://127.0.0.1:8000` | Where the backend is |
| `SAPINI_MATTER_ID` | no | the matter synced last | Which matter to show |

---

## Backend API

All on `http://127.0.0.1:8000`. The frontend reads everything from these; nothing on the dashboard is hardcoded.

| Endpoint | Returns / does |
| --- | --- |
| `GET /login`, `GET /callback`, `GET /me` | Clio OAuth: start, finish, and show the authorized user |
| `GET /matters` | Open matters in Clio (what `sync.py --list` prints) |
| `POST /sync?matter_id=` / `?query=` / `?all=true` (`&files=false` to skip downloads) | Sync a matter into SQLite (what `sync.py` calls) |
| `GET /cases` | Matters synced so far |
| `GET /case?matter_id=` | The full case record the firm sees (default: latest synced matter) |
| `GET /case/provider?matter_id=&provider_id=` | The trimmed record one provider may see |
| `GET /case/search?q=` (`&full=true` adds page text) | Document pages that best match a question, with the passage |
| `GET /case/recovery` | Latest status from each treating provider and each expert's conclusion, with quote, document and page |
| `GET /case/bills` | Every charge line from the itemized bills, with exact totals per provider |
| `GET /case/timeline` | The documents ordered by their real date |
| `GET /case/patient-id` | Which document is the client's photo ID, if any |
| `GET /documents/{id}`, `/documents/{id}/image`, `/documents/{id}/photo` | A document, a page image, and the portrait cut from a photo ID |
| `GET`/`PUT /users/{user_id}/overview` | How a user arranged their overview |
| `GET`/`PUT /cases/{case_id}/client-details` | The client's corrections to their own details |
| `GET`/`POST /cases/{case_id}/inquiries`, `PATCH /inquiries/{id}` | Questions the firm sends out, and their state (sent, seen, answered, closed) |
| `GET`/`POST /cases/{case_id}/uploads`, `GET /uploads/{id}`, `GET /uploads/{id}/file` | Files providers upload for the firm |
| `GET`/`POST`/`DELETE /users/{user_id}/chat?case_id=` | A user's assistant conversation (last 500 messages per case) |

### Where data lives outside Clio

One SQLite file, `sapini.db`, plus the downloaded documents in `files/`. Both are gitignored, and so is `.env`.

| Tables | Hold |
| --- | --- |
| `raw_records`, `doc_files`, `sync_runs`, `oauth_tokens` | The matter as synced from Clio, each record with a hash so unchanged records are skipped |
| `doc_pages`, `doc_pages_fts` | The text of every document page, and the search index over it |
| `doc_meta`, `medical_visits`, `recovery_evidence`, `bill_lines` | What the digest read out of the documents |
| `overview_layouts`, `client_details`, `inquiries`, `uploads`, `chat_history` | What users do on the dashboard: their layout, the client's corrections, questions and answers, provider uploads, assistant history |

---

## Project layout

```
AppliedAIHackathon26/
├── AppliedAIHackathon26-client-backend/   Python backend
│   ├── main.py          FastAPI app and every endpoint
│   ├── clio.py          Read-only Clio API client with OAuth
│   ├── sync.py          CLI: pull a matter into SQLite
│   ├── case_view.py     Raw Clio records -> the case record the dashboard shows
│   ├── patient_id.py    Finds the photo ID and cuts out the portrait
│   ├── db.py            SQLite connection
│   ├── digest/          Page text, dates, recovery status, bills, search index
│   ├── tests/           pytest
│   └── .env.example
├── client/                                Next.js 16 frontend
│   └── src/
│       ├── app/login/              Sign-in (demo account picker)
│       ├── app/(dashboard)/        Every view, at /<view>; 404 if not in the role
│       ├── app/actions.ts          Server actions: sign in/out, ask, send/answer questions
│       ├── app/api/                Search, documents, uploads, patient photo
│       ├── data/                   Types, the case loader, the per-role whitelists, nav
│       ├── lib/                    Session, dashboard, assistant, history, inquiries, preferences
│       └── components/             AppShell, firm cards, provider cards, inquiry cards
├── AGENTS.md / CLAUDE.md                  Notes for AI coding agents working in this repo
└── README.md
```

More detail: `AppliedAIHackathon26-client-backend/README.md` and `client/README.md`.

### Tech stack

| Part | Built with |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Backend | Python, FastAPI, SQLite |
| Document reading | PyMuPDF for page text, Tesseract for scanned pages, OpenCV for the portrait on a photo ID |
| Search | SQLite FTS5 (full-text, ranked by BM25) |
| Model | Claude Opus 5.5 (`claude-opus-5-5`) through the Anthropic SDK, in the assistant only |
| Runs on | A laptop: the backend on `127.0.0.1:8000`, the frontend on `localhost:3000` |

---

## Tests

```bash
cd AppliedAIHackathon26-client-backend && source .venv/bin/activate && pytest    # the digest, search and patient-ID logic
cd client && npm run lint && npm run build
```

---

## What is real, what is fixed, and what is not done

**Read from Clio at run time:** the client, the incident, injuries, providers and their bills, the insurer, case value and policy limit, liens, costs, to-dos, documents, updates, the legal team, the current stage, the dates and the statute of limitations. Much of it is read out of free-text notes and custom fields. A field Clio doesn't hold comes back empty and its card hides itself.

**Fixed in the code:**

- The names of the eight case stages. Which stage the case is in comes from Clio's matter stage.
- The one-third fee share used in the settlement breakdown.
- The phrases the digest looks for in medical records ("continue care", "discharge from physical therapy" and so on).
- The suggested questions in the search box, and the three one-click replies a provider can start an answer from.
- What a provider may see. It is a fixed whitelist; attorneys can't yet adjust it per provider.

**Not done:**

- Sign-in is a demo account picker with no passwords. The backend's own endpoints have no authentication; the frontend's server enforces the roles. Don't expose port 8000 beyond your machine.
- Nothing re-syncs on its own. The dashboard is as fresh as the last sync.
- "Call" only shows a toast. Messages from the firm to a provider or the client are real (sent as questions and tracked); a message from a provider or the client back to the firm still only shows a toast. Provider uploads are real.
- Clio has no structured offer, demand or target range for this matter, so those cards stay hidden.
- The digest's recovery status, document dates and bill lines are served by the API and read by the assistant, but have no card of their own yet.
- The sign-in briefing is built by rules, not written by a model.

---

## AI models and cost per case

**Digesting a case uses no model and costs nothing to run.** The sync, the case view, the document digest and the search are plain rules and SQL.

**The assistant is the only model call.** It uses Claude Opus 5.5 (`claude-opus-5-5`), once per question, and only when someone at the firm asks. Each call sends:

- the case record and the digest's facts, about 25,000 tokens, cached between questions;
- the twelve best-matching document pages and the question, about 10,000 tokens;
- and gets back a short answer and a draft message, under 1,000 tokens.

At $4 per million input tokens, $20 per million output tokens and $0.20 per million cached tokens read, that is about **$0.20 for the first question and about $0.07 for each one after it** while the cache is warm. Ten questions on a case is roughly $1 to $2. These figures are estimated from the size of what is sent for the Sapini matter, not measured from a bill.

If Claude declines a question, the request falls back to another model on the server. If there is no API key or the API can't be reached, keyword rules answer from the same material.

---

## License

MIT. See `LICENSE`.

# CaseBoard client

Next.js (App Router) + React + TypeScript frontend. Ported from the static mockup in `prototype/`.

```bash
npm install
npm run dev     # http://localhost:3000
```

All case data comes from the Sapini backend in `../AppliedAIHackathon26-client-backend`, which syncs the matter from Clio. Start it first (see its README); the client expects it at `http://127.0.0.1:8000` (override with `SAPINI_API_URL`, pick a matter with `SAPINI_MATTER_ID`). If it is down, pages show how to start it instead of falling back to sample data.

One dashboard, three kinds of user: the law firm, a medical provider, and the client (plaintiff). Who is signed in decides which views exist and which data the browser receives. The law firm's dashboard is the one being built first; the provider's is the ported mockup, and the client's shows what the firm holds about them and who is working on their case.

## Layout

- `src/app/login/page.tsx` — sign-in. Until the backend has real users, it lists a demo account for everyone on the case in Clio (`src/data/accounts.ts`): the firm user, each medical provider and the client.
- `src/app/(dashboard)/` — everything behind the login. `layout.tsx` loads the signed-in user's record and renders the shell; `[view]/page.tsx` is every screen, at `/<view>` (e.g. `/overview`, `/financials`). A view that isn't in the user's role is a 404.
- `src/app/actions.ts` — server actions: sign in, sign out, ask the assistant, send, see, answer and close a question. `src/app/api/search/route.ts` — the document pages that match what is typed in the search box (firm only).
- `src/lib/session.ts` — the session cookie. `src/lib/dashboard.ts` — `getDashboard()`, the one place data comes from: it returns only the record the signed-in role may see. It gets the case from the backend.
- `src/lib/preferences.ts` — how each user arranged their overview (tiles added, removed, moved, resized, locked). Saved under their account in the backend, so it is the same on every computer they sign in on.
- `src/lib/profile.ts` — the client's own changes to their personal details. Saved per case in the backend and laid over what Clio has, so the firm and the providers see them too.
- `src/lib/assistant.ts` — "Ask about this case" (firm only). The question is answered from everything held on the case: the case record, the facts the backend drew from the documents, the pages of the PDFs that match (`src/lib/passages.ts` gets both from the backend), and the answers to questions already sent out. When the case doesn't hold the answer, the reply says so and comes with a message to whoever would know (a medical provider or the client), ready to send. Claude does this given Claude API credentials: put `ANTHROPIC_API_KEY=...` in `client/.env.local` and restart `npm run dev`. Without them, keyword rules over the same material stand in.
- `src/lib/history.ts` — what the firm user asked the assistant and what it answered, kept under their account in the backend. The conversation comes back on every sign-in, and the clock button in the search box opens it: every past question, searchable, each opening to its answer with an "Ask again".
- `src/lib/inquiries.ts`, `src/components/inquiry-cards.tsx` — the questions the firm sends out. The firm tracks each one (sent, seen, answered) on its overview and under "Questions sent"; the provider or client it went to finds it on their overview, in their sign-in briefing and under "Questions for you", and answers it there. Kept in the backend's `inquiries` table.
- `src/data/types.ts` — the shapes of each role's record. `src/data/case.ts` — `loadCase()`, which fetches the case from the backend, and `forProvider()` / `forClient()`, which build the trimmed records. `src/data/nav.ts` — the roles and their views. Adding a view means one entry there and one in `src/components/views.tsx`.
- `src/components/AppShell.tsx` — sidebar, sticky case header, search, message dialog, toasts. Cards read their data with `useFirmCase()` / `useProviderCase()`.
- `src/components/firm-cards.tsx`, `provider-cards.tsx` — the cards each role's views are built from.
- `src/app/globals.css` — the mockup's stylesheet.

`src/data/case.ts`, `src/data/accounts.ts` and `src/lib/*` are server-only (`import "server-only"`), so the full case record never reaches a provider's or client's browser. Client components import types from `src/data/types.ts` and get data from the shell.

## Not real yet

- Sign-in is a demo: no passwords, and the session cookie just names a demo account. The "Demo · signed in as" switch in the sidebar signs in as the first account for each role.
- Clio has no structured offer, demand or target range for this matter, so those stay hidden; provider bill amounts are read from the "Specials tally" note.
- Calling and uploads only show a toast (documents open from the backend). Messages from the firm to a provider or the client are real (they are sent as questions and tracked); a message from a provider or the client to the firm still only shows a toast.

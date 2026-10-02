# CaseBoard client

Next.js (App Router) + React + TypeScript frontend. Ported from the static mockup in `prototype/`.

```bash
npm install
npm run dev     # http://localhost:3000
```

All case data comes from the Sapini backend in `../AppliedAIHackathon26-client-backend`, which syncs the matter from Clio. Start it first (see its README); the client expects it at `http://127.0.0.1:8000` (override with `SAPINI_API_URL`, pick a matter with `SAPINI_MATTER_ID`). If it is down, pages show how to start it instead of falling back to sample data.

One dashboard, three kinds of user: the law firm, a medical provider, and the client (plaintiff). Who is signed in decides which views exist and which data the browser receives. The law firm's dashboard is the one being built first; the provider's is the ported mockup, and the client's is a placeholder.

## Layout

- `src/app/login/page.tsx` — sign-in. Until the backend has real users, it lists a demo account for everyone on the case in Clio (`src/data/accounts.ts`): the firm user, each medical provider and the client.
- `src/app/(dashboard)/` — everything behind the login. `layout.tsx` loads the signed-in user's record and renders the shell; `[view]/page.tsx` is every screen, at `/<view>` (e.g. `/overview`, `/financials`). A view that isn't in the user's role is a 404.
- `src/app/actions.ts` — server actions: sign in, sign out, ask the assistant.
- `src/lib/session.ts` — the session cookie. `src/lib/dashboard.ts` — `getDashboard()`, the one place data comes from: it returns only the record the signed-in role may see. It gets the case from the backend.
- `src/lib/assistant.ts` — keyword answers for "Ask about this case" (firm only), built from the loaded case; replace with a model call.
- `src/data/types.ts` — the shapes of each role's record. `src/data/case.ts` — `loadCase()`, which fetches the case from the backend, and `forProvider()` / `forClient()`, which build the trimmed records. `src/data/nav.ts` — the roles and their views. Adding a view means one entry there and one in `src/components/views.tsx`.
- `src/components/AppShell.tsx` — sidebar, sticky case header, search, message dialog, toasts. Cards read their data with `useFirmCase()` / `useProviderCase()`.
- `src/components/firm-cards.tsx`, `provider-cards.tsx` — the cards each role's views are built from.
- `src/app/globals.css` — the mockup's stylesheet.

`src/data/case.ts`, `src/data/accounts.ts` and `src/lib/*` are server-only (`import "server-only"`), so the full case record never reaches a provider's or client's browser. Client components import types from `src/data/types.ts` and get data from the shell.

## Not real yet

- Sign-in is a demo: no passwords, and the session cookie just names a demo account. The "Demo · signed in as" switch in the sidebar signs in as the first account for each role.
- Clio has no structured offer, demand or target range for this matter, so those stay hidden; provider bill amounts are read from the "Specials tally" note.
- Calling, messaging and uploads only show a toast (documents open from the backend); the assistant's answers are canned.

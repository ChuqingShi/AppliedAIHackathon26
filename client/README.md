# CaseBoard client

Next.js (App Router) + React + TypeScript frontend. Ported from the static mockup in `prototype/`.

```bash
npm install
npm run dev     # http://localhost:3000
```

## Layout

- `src/app/[role]/[view]/page.tsx` — every screen is `/<role>/<view>`, e.g. `/firm/overview`, `/provider/team`. `/` redirects to `/firm/overview`.
- `src/data/case.ts` — the sample case (all fictional) and `forProvider()`, which builds the trimmed record a medical provider sees.
- `src/data/nav.ts` — the roles and their views. Adding a view means one entry here and one in `src/components/views.tsx`.
- `src/components/AppShell.tsx` — sidebar, sticky case header, search, message dialog, toasts.
- `src/components/firm-cards.tsx`, `provider-cards.tsx` — the cards each role's views are built from.
- `src/components/assistant.tsx` — canned answers for "Ask about this case"; replace with a backend call.
- `src/app/globals.css` — the mockup's stylesheet.

## Not real yet

The sample data is bundled into the browser for both roles, and the role switch in the sidebar is a demo toggle, not auth. Before real data goes in, the provider record has to be built on the server so firm-only data never reaches a provider's browser.

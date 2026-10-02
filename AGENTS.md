# client/ — this is NOT the Next.js you know

The Next.js version in `client/` has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `client/node_modules/next/dist/docs/` before writing any code there. Heed deprecation notices.

Keep `AGENTS.md` and `CLAUDE.md` here at the repo root, not in `client/`. `next dev` re-creates both inside `client/` when an AI coding agent runs it (see `client/node_modules/next/dist/server/lib/generate-agent-files.js`); those copies are gitignored, so delete them rather than committing them.

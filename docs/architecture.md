# Architecture (Milestone 1)

```
 lesson.md + labs.yml + blocks.yml           (content/, the source of truth)
        │  tools/content: extract → verify (0 lines lost) → check_labs (CPython) → build
        ▼
 apps/web/public/content/*.json              typed blocks with source line ranges, bilingual labs
        │
        ▼
 Browser (React + TypeScript, Vite, PWA)
   ├─ pages / design system / i18n (ICU messages, en + fa, RTL)
   ├─ runner: main thread ⇄ Web Worker ⇄ Pyodide (CPython 3.13)  + runner.py (capture, trace, input)
   ├─ progress store: IndexedDB rows + outbox  ──sync──►  Supabase RPC save_progress
   └─ auth: supabase-js (PKCE) → GoTrue
                                                     Supabase: Postgres (RLS) + GoTrue
```

## Content pipeline (`tools/content/`)
`extract.py` turns the markdown into typed blocks (headings, paragraphs, lists with nested code, tables, quotes, code) keeping each block's source line range. `verify.py` is an independent check: sha256 of the source, ranges cover every line exactly once, the document rebuilds to the original, counts match. `check_labs.py` validates `labs.yml` against `labs.schema.json`, restricts inline HTML to a safe set, and runs every prediction, exercise (solution must pass all tests, starter must fail one) and lesson code block in real CPython. `engine_check.mjs` runs the same snippets in Pyodide and compares to CPython. `build.py` runs all of it and writes the JSON the app loads. Lesson text is rendered with markdown-it with raw HTML disabled.

## Runner (`apps/web/src/runner/`)
- `worker.ts` loads self-hosted Pyodide and `runner.py` (the same file the CI differential test runs).
- `runner.run()` swaps `sys.stdout/stderr/input`, executes the learner's code as `__main__` in a fresh namespace, and returns ordered events, output, and a structured error. Output is capped.
- With `trace=True` it records one snapshot per executed line (frames, heap objects with stable ids, objects that became unreachable) via `sys.settrace`. The visualiser UI is Milestone 2; the data is already produced and tested.
- Stop: with cross-origin isolation a SharedArrayBuffer carries an interrupt signal (`KeyboardInterrupt`) and live `input()` via `Atomics.wait`. Without it the worker is terminated and respawned.
- Files live under `/u-<userKey>` on an IndexedDB-backed disk, one per user.

## Progress and sync (`src/sync/`)
Rows are `{key, data, client_ts}`. Local save applies the same merge rules as the server, writes the row and an outbox entry, and flushes in batches of 200 with backoff. Rules (identical in `merge.ts` and in SQL `save_progress`): last writer wins by `client_ts` (ties go to the incoming row); `ex:*` merge field by field (pass is OR, attempts and hints are max); `read:*` and `bm:*` never go backwards. After sign-in, `adopt('guest')` moves guest rows to the account, `pullAndMerge` brings down the server's rows, `flush` sends the rest.

## Database (`supabase/`, see docs/database.md)
Authorization lives in Postgres: RLS on every table, helper functions (`is_teacher`, `teaches_class`, `teaches_student`, `in_class`), privileged roles that the API can never grant, rate limits inside the functions, an append-only audit log, `export_my_data` and `delete_my_account`. Secrets (the teacher code) are in a table no API role can read. The browser holds only the public anon key.

## Security headers
`security-headers.ts` is the single source for the CSP and cross-origin isolation headers. It feeds the dev server, the preview server and a generated `_headers` file for static hosts. CSP: scripts from self plus `wasm-unsafe-eval` (needed for WebAssembly), no inline script, `connect-src` limited to self and the configured Supabase origin.

## Frontend structure
`pages/` (route components), `design/ui.tsx` (Field, Notice, Spinner), `styles/*.css` (tokens, themes, RTL via logical properties), `i18n/` (ICU, Persian digits, Jalali), `prefs/` (theme, language, text size, palette, font, motion; stored locally), `content/` (loading and rendering lessons), `auth/` (client, API wrapper, provider), `db/types.ts` (generated from the migrations).
